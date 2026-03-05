package com.genesis.prototype

import android.content.Context
import android.os.Build
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class CrashLogger(private val context: Context) : Thread.UncaughtExceptionHandler {

    private val previousHandler: Thread.UncaughtExceptionHandler? =
        Thread.getDefaultUncaughtExceptionHandler()

    override fun uncaughtException(thread: Thread, throwable: Throwable) {
        try {
            writeCrashLog(thread, throwable)
        } catch (_: Throwable) {
            // Never block the default crash flow if logging fails.
        } finally {
            previousHandler?.uncaughtException(thread, throwable)
                ?: run {
                    android.os.Process.killProcess(android.os.Process.myPid())
                    kotlin.system.exitProcess(10)
                }
        }
    }

    private fun writeCrashLog(thread: Thread, throwable: Throwable) {
        val now = Date()
        val timestamp = FILE_NAME_FORMAT.format(now)
        val logDirectory = File(context.filesDir, LOG_DIRECTORY_NAME)
        if (!logDirectory.exists()) {
            logDirectory.mkdirs()
        }

        val crashFile = File(logDirectory, "crash_${timestamp}.txt")
        crashFile.bufferedWriter().use { writer ->
            writer.appendLine("Timestamp: ${DISPLAY_FORMAT.format(now)}")
            writer.appendLine("Thread: ${thread.name} (id=${thread.id})")
            writer.appendLine("App Version: ${getAppVersion(context)}")
            writer.appendLine("Package: ${context.packageName}")
            writer.appendLine("Android: ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT})")
            writer.appendLine("Device: ${Build.MANUFACTURER} ${Build.MODEL}")
            writer.appendLine("Brand: ${Build.BRAND}")
            writer.appendLine("Product: ${Build.PRODUCT}")
            writer.appendLine("ABI: ${Build.SUPPORTED_ABIS.joinToString()}")
            writer.appendLine()
            writer.appendLine("Stack trace:")
            writer.appendLine(getFullStackTrace(throwable))
        }
    }

    private fun getAppVersion(context: Context): String {
        return try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            val versionName = packageInfo.versionName ?: "unknown"
            val versionCode = packageInfo.longVersionCode
            "$versionName ($versionCode)"
        } catch (_: Exception) {
            "unknown"
        }
    }

    private fun getFullStackTrace(throwable: Throwable): String {
        val stringWriter = StringWriter()
        PrintWriter(stringWriter).use { printWriter ->
            throwable.printStackTrace(printWriter)
            var cause = throwable.cause
            while (cause != null) {
                printWriter.appendLine("\nCaused by:")
                cause.printStackTrace(printWriter)
                cause = cause.cause
            }
        }
        return stringWriter.toString()
    }

    companion object {
        private const val LOG_DIRECTORY_NAME = "logs"
        private val FILE_NAME_FORMAT = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)
        private val DISPLAY_FORMAT = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS Z", Locale.US)

        fun install(context: Context) {
            Thread.setDefaultUncaughtExceptionHandler(CrashLogger(context.applicationContext))
        }
    }
}

package com.genesis.prototype

import android.app.Application

class MainApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        CrashLogger.install(this)
    }
}

# Genesis RN Prototype

React Native(Expo) 기반의 Genesis v1 워크스페이스 프로토타입입니다.

## 실행
```bash
npm install
npm run start
```

## 포함된 기능
- 조합(드래그 드롭 시점), 순서 무관 조합 키
- 빈 공간 더블탭 기본 4요소 생성(N/E/S/W)
- 요소 더블탭 복제
- 도감 팝업 + 도감에서 즉시 배치
- 즐겨찾기(최대 10개) + 퀵드로우 버튼(2~11)
- NORMAL/DRAGGING 모드 전환 + 드래그 중 휴지통 드롭 삭제
- 로컬 저장/복원(AsyncStorage)
- Help + 보상형 힌트(일 3회 카운트 로직)

## GitHub Actions로 Release APK 빌드/다운로드
1. GitHub 저장소의 **Actions** 탭으로 이동합니다.
2. **Build Android APK** 워크플로를 선택한 뒤 원하는 run을 엽니다.
3. run 페이지의 **Artifacts** 섹션에서 `app-release-apk`를 다운로드합니다.

### Release APK 산출 경로
- 워크플로 내부 Gradle 산출물 경로: `android/app/build/outputs/apk/release/*.apk`
- 업로드되는 Artifact 이름: `app-release-apk`

## 로컬에서 Metro 없이 동작하는 Release APK 빌드

디바이스에서 앱이 실행 직후 종료되는 가장 흔한 원인은 **debug APK** 설치입니다. Debug APK는 개발 서버(Metro)의 JS 번들을 기대하기 때문에, Metro에 연결되지 않은 환경에서는 실행 시 종료될 수 있습니다.

```bash
# 1) Android native 프로젝트 생성(최초 1회 또는 app config 변경 시)
npx expo prebuild --platform android --non-interactive

# 2) (선택) JS 번들 수동 생성
npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file node_modules/expo/AppEntry.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res

# 3) Release APK 빌드
cd android
./gradlew clean assembleRelease

# 4) APK 내부에 JS 번들 포함 확인
unzip -l app/build/outputs/apk/release/app-release.apk | rg "assets/index.android.bundle"
```

- 산출물: `android/app/build/outputs/apk/release/app-release.apk`
- 참고: 일반적으로 `assembleRelease` 실행 시 Gradle task(`bundleReleaseJsAndAssets`)가 JS 번들을 APK에 포함합니다.

# Genesis RN Prototype

React Native(Expo) 기반 Genesis v1 프로토타입입니다.

## 1) 프로젝트 초기화
```bash
npm install
npx expo prebuild --platform android --non-interactive
```

## 2) APK 빌드 (로컬)
```bash
cd android
./gradlew assembleDebug
```

빌드 산출물:
- `android/app/build/outputs/apk/debug/app-debug.apk`

릴리즈 APK 빌드:
```bash
cd android
./gradlew assembleRelease
```

## 3) 원클릭 스크립트
```bash
./scripts/build-apk.sh
```

## 4) EAS (선택)
`eas.json`은 APK 타입으로 설정되어 있습니다.

```bash
eas build -p android --profile production
```

## 구현된 프로토타입 기능
- 조합(드래그 드롭 시점), 순서 무관 조합 키
- 빈 공간 더블탭 기본 4요소 생성(N/E/S/W)
- 요소 더블탭 복제
- 도감 팝업 + 도감에서 즉시 배치
- 즐겨찾기(최대 10개) + 퀵드로우 버튼(2~11)
- NORMAL/DRAGGING 모드 전환 + 드래그 중 휴지통 드롭 삭제
- 로컬 저장/복원(AsyncStorage)
- Help + 보상형 힌트(일 3회 카운트 로직)


## 5) GitHub Actions로 APK 아티팩트 받기 (추천)
- 워크플로 파일: `.github/workflows/android-apk.yml`
- 트리거: `workflow_dispatch`(수동 실행), `main` 브랜치 push

### 다운로드 방법
1. GitHub 저장소의 **Actions** 탭으로 이동
2. **Build Android APK** 워크플로 실행 이력 선택
3. 하단 **Artifacts**에서 `app-debug-apk` 클릭 후 다운로드

### 산출물 경로
- 빌드 경로: `android/app/build/outputs/apk/debug/*.apk`
- 대표 파일: `android/app/build/outputs/apk/debug/app-debug.apk`


## 6) Release 업로드 방식 (PR 바이너리 문제 회피)
PR에서 APK 바이너리를 직접 다루면 `binary file not supported` 류의 제약이 발생할 수 있습니다.
권장 방식은 **APK를 Git에 커밋하지 않고**, Actions의 Artifact 또는 Release Assets로 배포하는 것입니다.

- 릴리즈 워크플로: `.github/workflows/android-release.yml`
- 트리거:
  - 태그 푸시: `v*` (예: `v1.0.0`)
  - 수동 실행: Actions > Build and Upload APK to GitHub Release > tag 입력

### Release 다운로드 방법
1. GitHub 저장소의 **Releases** 페이지 이동
2. 해당 태그 릴리즈 선택
3. **Assets**에서 APK 파일 다운로드

> 참고: PR에서 `binary file not supported`를 피하기 위해 저장소에는 APK/아이콘 같은 바이너리 산출물을 커밋하지 않습니다. APK는 Actions Artifact 또는 Release Assets로만 배포합니다.

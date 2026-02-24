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


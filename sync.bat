@echo off
chcp 65001 >nul
rem 노션에서 고친 것을 사이트에 반영한다. 더블클릭이면 끝.
rem 사전 준비(한 번만): setx NOTION_TOKEN ntn_...
cd /d "%~dp0"

python tools\sync_notion.py %*
if errorlevel 1 (
  echo.
  echo 동기화 실패 - 위 메시지를 확인하세요.
  pause
  exit /b 1
)

git diff --quiet -- data-civil.js
if not errorlevel 1 (
  echo 바뀐 것이 없어 배포하지 않습니다.
  pause
  exit /b 0
)

git add data-civil.js
git commit -m "sync: 노션 수정분 반영"
git push
echo.
echo 배포 완료 - 1~2분 뒤 사이트에 반영됩니다.
pause

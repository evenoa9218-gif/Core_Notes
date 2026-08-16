@echo off
chcp 65001 >nul
rem 노션에서 고친 것을 사이트에 반영한다. 더블클릭이면 끝.
rem 사전 준비(한 번만): setx NOTION_TOKEN ntn_...
cd /d "%~dp0"

python tools\sync_notion.py %*
if errorlevel 1 goto :fail
python tools\sync_crim.py %*
if errorlevel 1 goto :fail
python tools\verify_fidelity.py
if errorlevel 1 goto :fail
python tools\build_criminal.py
if errorlevel 1 goto :fail
python tools\sync_minso.py %*
if errorlevel 1 goto :fail
python tools\build_minso.py
if errorlevel 1 goto :fail

git add data-civil.js data-criminal.js data-minso.js
git diff --cached --quiet
if not errorlevel 1 (
  echo 바뀐 것이 없어 배포하지 않습니다.
  pause
  exit /b 0
)

git commit -m "sync: 노션 수정분 반영"
git push
echo.
echo 배포 완료 - 1~2분 뒤 사이트에 반영됩니다.
pause
exit /b 0

:fail
echo.
echo 동기화 실패 - 위 메시지를 확인하세요.
pause
exit /b 1

@echo off
chcp 65001 > nul
title 노션 데이터 동기화 및 Vercel 자동 배포

echo ========================================================
echo        시너지 미적분1 노션 최신 데이터 동기화
echo ========================================================
echo.
echo [1/2] 노션 DB에서 최신 데이터 수집 중...
python notion_sync.py

if %ERRORLEVEL% NEQ 0 (
    echo [오류] 노션 데이터 수집에 실패했습니다. 인터넷 연결 또는 토큰을 확인하세요.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/2] Vercel 온라인 자동 배포 중 (GitHub Push)...
git add .
git commit -m "update: sync latest notion data"
git push origin main

echo.
echo ========================================================
echo [완료] 최신 노션 데이터가 Vercel에 자동 배포되었습니다!
echo 약 10~15초 후 온라인 사이트에서 확인하실 수 있습니다.
echo 사이트: https://sonpuri-hub.vercel.app/
echo ========================================================
echo.
pause

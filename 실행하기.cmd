@echo off
chcp 65001 > nul
title 시너지 손풀이 링크 검색기

echo ========================================================
echo        시너지 손풀이 링크 검색 웹 서비스 시작
echo ========================================================
echo.
echo [1/2] 브라우저 자동 오픈 준비 중...
start "" "http://localhost:5000"

echo [2/2] Flask 서버 실행 중 (종료하려면 이 창에서 Ctrl+C)...
echo.
python app.py
pause

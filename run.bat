@echo off
title NoteTube - YouTube Transcript Generator
cd /d "%~dp0"
echo ========================================================
echo   NoteTube - YouTube Transcript & AI Summarizer
echo ========================================================
echo.
echo Menjalankan server di http://localhost:8088 ...
echo Silakan buka browser Anda di: http://localhost:8088
echo.
start http://localhost:8088
python server.py
pause

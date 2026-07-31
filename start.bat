@echo off
title Memora Launcher
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo   Memora Launcher
echo   ================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [!] Node.js not found
    echo     Please install from https://nodejs.org
    pause
    exit /b 1
)
node --version

if not exist "node_modules" (
    echo.
    echo [1/2] Installing dependencies...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo [!] npm install failed
        pause
        exit /b 1
    )
)

echo.
echo [2/2] Starting Memora (dev mode, hot reload)...
echo.
call npm run dev
if errorlevel 1 (
    echo.
    echo [!] Start failed
    pause
    exit /b 1
)

@echo off
echo Installing Teacher App...
call npm install
if %errorlevel% neq 0 (
    echo Error installing dependencies. Please contact support.
    pause
    exit /b %errorlevel%
)

echo Creating desktop shortcut...
node create-shortcut.js
if %errorlevel% neq 0 (
    echo Warning: Could not create desktop shortcut.
)

echo Starting Teacher App...
call npm start
if %errorlevel% neq 0 (
    echo Error starting the app. Please contact support.
    pause
    exit /b %errorlevel%
)
pause 
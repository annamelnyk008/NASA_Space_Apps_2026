@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Building js\app.js from js\src\...

(
echo (function () {
echo   'use strict';
echo.
type "js\src\01-solar-system.js"
type "js\src\02-mars.js"
type "js\src\03-surface.js"
type "js\src\04-loop.js"
echo.})();
) > "js\app.js"

if errorlevel 1 (
  echo Build failed.
  exit /b 1
)

echo Done: js\app.js


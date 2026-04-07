@echo off
echo.
echo =========================================================
echo 🚀 STARTING SECURVAULT UNIFIED ECOSYSTEM
echo =========================================================
echo.

if not exist node_modules (
    echo [System] Installing root dependencies (concurrently)...
    call npm install
)

if not exist backend\node_modules (
    echo [System] Installing backend dependencies...
    call npm install --prefix backend
)

if not exist frontend\node_modules (
    echo [System] Installing frontend dependencies...
    call npm install --prefix frontend
)

echo.
echo [System] Launching Servers...
echo.

npm run dev
pause

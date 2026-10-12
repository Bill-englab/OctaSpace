@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Please install Node.js 24 or newer. & pause & exit /b 1)
where pnpm >nul 2>nul || (echo Please install pnpm. & pause & exit /b 1)
call pnpm install --frozen-lockfile || (pause & exit /b 1)
call pnpm build || (pause & exit /b 1)
node server/index.js
pause

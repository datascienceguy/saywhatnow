@echo off
echo [0/4] Checkpointing WAL into dev.db...
node scripts/checkpoint-db.js
if %errorlevel% neq 0 (
    echo ERROR: WAL checkpoint failed
    exit /b 1
)

echo [1/4] Waking app and removing remote DB...
flyctl ssh console --command "rm -f /data/prod.db" --app saywhatnow
if %errorlevel% neq 0 (
    echo ERROR: SSH console failed
    exit /b 1
)

echo [2/4] Uploading local DB...
flyctl sftp put prisma/dev.db /data/prod.db --app saywhatnow
if %errorlevel% neq 0 (
    echo ERROR: SFTP upload failed
    exit /b 1
)

echo [3/4] Fixing permissions and verifying upload...
flyctl ssh console --command "chown nextjs:nogroup /data/prod.db && ls -lh /data/prod.db" --app saywhatnow

echo [4/4] Restarting app...
flyctl apps restart saywhatnow
if %errorlevel% neq 0 (
    echo WARNING: restart command failed, trying deploy...
    flyctl deploy --strategy=immediate
)

echo Done.

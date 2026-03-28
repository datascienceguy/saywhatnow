Write-Host "Syncing local DB to Fly.io..." -ForegroundColor Cyan

Write-Host "Removing existing remote DB..."
flyctl ssh console --command "rm /data/prod.db"

Write-Host "Uploading local DB..."
flyctl sftp put prisma/dev.db /data/prod.db

Write-Host "Done." -ForegroundColor Green

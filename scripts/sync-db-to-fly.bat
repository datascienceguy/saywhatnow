@echo off
echo Syncing local DB to Fly.io...
flyctl ssh console --command "rm /data/prod.db"
flyctl sftp put prisma/dev.db /data/prod.db
echo Done.

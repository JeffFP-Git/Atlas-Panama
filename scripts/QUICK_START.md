# Quick Start: Daily Finca Scraper at 9 PM

## Mac / Linux (One Command)

```bash
# 1. Make script executable (if not already)
chmod +x scripts/run-finca-daily.sh

# 2. Test it first
./scripts/run-finca-daily.sh

# 3. Add to crontab (replace path with YOUR actual path!)
(crontab -l 2>/dev/null; echo "0 21 * * * /bin/bash $(pwd)/scripts/run-finca-daily.sh >> $(pwd)/logs/cron.log 2>&1") | crontab -

# 4. Verify it was added
crontab -l
```

## Windows (PowerShell as Admin)

```powershell
# 1. Allow PowerShell scripts (one-time)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 2. Test the script
cd C:\path\to\panama-scraper
.\scripts\run-finca-daily.ps1

# 3. Create scheduled task (replace path!)
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$(Get-Location)\scripts\run-finca-daily.ps1`""
$Trigger = New-ScheduledTaskTrigger -Daily -At "9:00PM"
Register-ScheduledTask -TaskName "Daily Finca Scraper" -Action $Action -Trigger $Trigger -Description "Runs finca scraper every day at 9 PM"
```

## Check Logs

- Mac/Linux: `ls -la logs/`
- Windows: `dir logs\`

## Full Documentation

See `scripts/SCHEDULER_SETUP.md` for detailed instructions and troubleshooting.


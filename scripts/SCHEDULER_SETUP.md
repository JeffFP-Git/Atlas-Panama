# Setting Up Daily Finca Scraper (9 PM)

This guide explains how to set up the finca scraper to run automatically every day at 9 PM on both Mac and Windows.

## Prerequisites

1. Make sure your `.env` file has the required variables:
   ```bash
   BUILDING_NAME="Your Company Name Here"
   # OR
   SEARCH_PARAMETER="Your Company Name Here"
   
   RP_USERNAME=your_email@example.com
   RP_PASSWORD=your_password
   HEADLESS=1
   ```

2. Test the scraper manually first:
   ```bash
   node lib/finca.js --name "Your Company Name" --headless=1
   ```

---

## Mac / Linux Setup (using cron)

### Step 1: Make the script executable

```bash
chmod +x scripts/run-finca-daily.sh
```

### Step 2: Test the script manually

```bash
./scripts/run-finca-daily.sh
```

Check the logs in `logs/finca-daily-*.log` to verify it works.

### Step 3: Set up cron job

1. Open your crontab for editing:
   ```bash
   crontab -e
   ```

2. Add this line to run at 9 PM every day:
   ```cron
   0 21 * * * /bin/bash /Users/jonathanchristie/Code/panama-scraper/scripts/run-finca-daily.sh >> /Users/jonathanchristie/Code/panama-scraper/logs/cron.log 2>&1
   ```

   **Important:** Replace `/Users/jonathanchristie/Code/panama-scraper` with your actual project path!

3. Save and exit (in vim: press `Esc`, type `:wq`, press Enter)

4. Verify the cron job was added:
   ```bash
   crontab -l
   ```

### Step 4: Verify cron is running

On macOS, cron might need permission to run. Check:
- System Preferences → Security & Privacy → Privacy → Full Disk Access
- Make sure Terminal (or your terminal app) has Full Disk Access

### Troubleshooting Mac cron

- Check cron logs: `grep CRON /var/log/system.log` (or check Console.app)
- Check script logs: `ls -la logs/`
- Test cron syntax: Use [crontab.guru](https://crontab.guru) to verify your schedule

---

## Windows Setup (using Task Scheduler)

### Step 1: Test the PowerShell script manually

Open PowerShell as Administrator and run:

```powershell
cd C:\path\to\panama-scraper
.\scripts\run-finca-daily.ps1
```

**Note:** If you get an execution policy error, run this first:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Step 2: Create a Scheduled Task

#### Option A: Using Task Scheduler GUI

1. Open **Task Scheduler** (search for it in Start menu)

2. Click **Create Basic Task** in the right panel

3. **General Tab:**
   - Name: `Daily Finca Scraper`
   - Description: `Runs finca scraper every day at 9 PM`
   - Select "Run whether user is logged on or not"
   - Check "Run with highest privileges" (if needed for file access)

4. **Trigger Tab:**
   - Begin the task: `On a schedule`
   - Settings: `Daily`
   - Start: `9:00:00 PM`
   - Recur every: `1 days`

5. **Action Tab:**
   - Action: `Start a program`
   - Program/script: `powershell.exe`
   - Add arguments:
     ```
     -ExecutionPolicy Bypass -File "C:\Users\YourName\Code\panama-scraper\scripts\run-finca-daily.ps1"
     ```
   - **Important:** Replace the path with your actual project path!

6. **Conditions Tab:**
   - Uncheck "Start the task only if the computer is on AC power" (if you want it to run on battery)
   - Check "Wake the computer to run this task" (optional)

7. **Settings Tab:**
   - Check "Allow task to be run on demand"
   - Check "Run task as soon as possible after a scheduled start is missed"
   - If the task fails, restart every: `10 minutes` (optional)

8. Click **OK** and enter your Windows password if prompted

#### Option B: Using PowerShell (Command Line)

Run PowerShell as Administrator:

```powershell
$Action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -File `"C:\Users\YourName\Code\panama-scraper\scripts\run-finca-daily.ps1`""

$Trigger = New-ScheduledTaskTrigger -Daily -At "9:00PM"

$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType S4U -RunLevel Highest

$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName "Daily Finca Scraper" `
    -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings `
    -Description "Runs finca scraper every day at 9 PM"
```

**Important:** Replace `C:\Users\YourName\Code\panama-scraper` with your actual project path!

### Step 3: Test the scheduled task

1. In Task Scheduler, find "Daily Finca Scraper"
2. Right-click → **Run**
3. Check the logs in `logs/finca-daily-*.log`

### Troubleshooting Windows Task Scheduler

- Check Task Scheduler history: Task Scheduler → Task Scheduler Library → Your task → History
- Check script logs: `logs\finca-daily-*.log`
- Verify PowerShell execution policy: `Get-ExecutionPolicy`
- Make sure the path uses forward slashes or escaped backslashes in the arguments

---

## Logs

Both scripts create logs in the `logs/` directory:

- **Success logs:** `logs/finca-daily-YYYYMMDD-HHMMSS.log`
- **Error logs:** `logs/finca-daily-errors.log` (appends all errors)

Check these logs to verify the scraper is running correctly.

---

## Changing the Schedule

### Mac/Linux (cron)

Edit your crontab:
```bash
crontab -e
```

Cron format: `minute hour day month weekday`

Examples:
- `0 21 * * *` = 9 PM every day
- `0 9 * * 1` = 9 AM every Monday
- `0 */6 * * *` = Every 6 hours

### Windows (Task Scheduler)

1. Open Task Scheduler
2. Find your task → Right-click → **Properties**
3. Go to **Triggers** tab → Edit
4. Change the schedule as needed

---

## Disabling the Scheduled Task

### Mac/Linux

Comment out the line in crontab:
```bash
crontab -e
# Add # at the start: # 0 21 * * * ...
```

Or remove it entirely:
```bash
crontab -e
# Delete the line
```

### Windows

1. Open Task Scheduler
2. Find your task → Right-click → **Disable**

Or via PowerShell:
```powershell
Disable-ScheduledTask -TaskName "Daily Finca Scraper"
```


# Daily Finca Scraper Runner for Windows
# This script runs the finca scraper and logs output

# Get the directory where this script is located
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir

# Change to project directory
Set-Location $ProjectDir

# Load environment variables from .env if it exists
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
}

# Set up logging
$LogDir = Join-Path $ProjectDir "logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $LogDir "finca-daily-$Timestamp.log"
$ErrorLog = Join-Path $LogDir "finca-daily-errors.log"

# Function to log with timestamp
function Write-Log {
    param([string]$Message)
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogMessage = "[$Timestamp] $Message"
    Write-Host $LogMessage
    Add-Content -Path $LogFile -Value $LogMessage
}

Write-Log "Starting daily finca scraper run..."

# Check if node is available
try {
    $null = Get-Command node -ErrorAction Stop
} catch {
    Write-Log "ERROR: node command not found. Make sure Node.js is installed and in PATH."
    Add-Content -Path $ErrorLog -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] ERROR: node command not found"
    exit 1
}

# Check if .env has required variables
$BuildingName = [Environment]::GetEnvironmentVariable("BUILDING_NAME", "Process")
$SearchParameter = [Environment]::GetEnvironmentVariable("SEARCH_PARAMETER", "Process")

if ([string]::IsNullOrEmpty($BuildingName) -and [string]::IsNullOrEmpty($SearchParameter)) {
    Write-Log "WARNING: BUILDING_NAME or SEARCH_PARAMETER not set in .env"
    Write-Log "The scraper will need --name argument or these env vars"
}

# Build the scraper command
$ScraperCmd = "node lib/finca.js"

if (-not [string]::IsNullOrEmpty($BuildingName)) {
    $ScraperCmd += " --name `"$BuildingName`""
} elseif (-not [string]::IsNullOrEmpty($SearchParameter)) {
    $ScraperCmd += " --name `"$SearchParameter`""
}

# Add headless flag (default to true for scheduled tasks)
$FincaHeadless = [Environment]::GetEnvironmentVariable("FINCA_HEADLESS", "Process")
if ([string]::IsNullOrEmpty($FincaHeadless)) {
    $ScraperCmd += " --headless=1"
} else {
    $ScraperCmd += " --headless=$FincaHeadless"
}

Write-Log "Running: $ScraperCmd"
Write-Log "Working directory: $ProjectDir"

# Execute the scraper and capture output
try {
    Invoke-Expression $ScraperCmd *>> $LogFile
    if ($LASTEXITCODE -eq 0) {
        Write-Log "✅ Finca scraper completed successfully"
        exit 0
    } else {
        Write-Log "❌ Finca scraper failed with exit code $LASTEXITCODE"
        Add-Content -Path $ErrorLog -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Scraper failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
} catch {
    Write-Log "❌ Finca scraper threw an exception: $_"
    Add-Content -Path $ErrorLog -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Exception: $_"
    exit 1
}


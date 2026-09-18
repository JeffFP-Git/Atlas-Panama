# Panama Scraper

Automated web scraper for Panama's Registro Público (RP.GOB.PA) that extracts property data, tracks changes, and sends email notifications.

## Features

- **Main Scraper**: Scrapes property data by building name
- **Finca Scraper**: Scrapes prelación (property records) by company/person name
- **Mercantil Scraper**: Enriches corporate owner data with Mercantil registry information
- **Change Tracking**: Automatically detects and reports changes between runs
- **Email Notifications**: Sends completion emails with spreadsheets attached
- **CAPTCHA Solving**: Integrated 2Captcha support for automated CAPTCHA solving

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation - macOS](#installation---macos)
- [Installation - Windows](#installation---windows)
- [Configuration](#configuration)
- [Running the Scrapers](#running-the-scrapers)
- [Email Setup](#email-setup)
- [Docker Setup (Optional)](#docker-setup-optional)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

1. **Node.js** (version 20 or higher)
   - Download from: https://nodejs.org/
   - Verify installation: `node --version` (should show v20.x.x or higher)
   - Verify npm: `npm --version`

2. **Git** (for cloning the repository)
   - macOS: Usually pre-installed, or install via Xcode Command Line Tools
   - Windows: Download from https://git-scm.com/download/win

3. **Chrome/Chromium Browser** (for Puppeteer)
   - Usually auto-installed with Puppeteer, but ensure Chrome is available

### Optional but Recommended

- **Docker Desktop** (for containerized runs)
  - macOS: https://www.docker.com/products/docker-desktop/
  - Windows: https://www.docker.com/products/docker-desktop/

---

## Installation - macOS

### Step 1: Open Terminal

1. Press `Cmd + Space` to open Spotlight
2. Type "Terminal" and press Enter
3. Or go to Applications → Utilities → Terminal

### Step 2: Install Node.js (if not installed)

1. Visit https://nodejs.org/
2. Download the macOS installer (LTS version recommended)
3. Run the installer and follow the prompts
4. Verify installation:
   ```bash
   node --version
   npm --version
   ```

### Step 3: Clone or Download the Repository

**Option A: Using Git (Recommended)**
```bash
# Navigate to where you want the project
cd ~/Documents  # or any directory you prefer

# Clone the repository
git clone <repository-url> panama-scraper

# Navigate into the project
cd panama-scraper
```

**Option B: Download ZIP**
1. Download the repository as a ZIP file
2. Extract it to your desired location (e.g., `~/Documents/panama-scraper`)
3. Open Terminal and navigate to the extracted folder:
   ```bash
   cd ~/Documents/panama-scraper
   ```

### Step 4: Install Dependencies

```bash
# Install all required packages
npm install
```

This will:
- Download all Node.js dependencies
- Install Puppeteer (which includes Chromium)
- Set up the project structure

**Note:** This may take 5-10 minutes depending on your internet connection.

### Step 5: Create Environment File

```bash
# Create the .env file
touch .env
```

Or create it manually:
1. Open a text editor (TextEdit, VS Code, etc.)
2. Create a new file named `.env` in the project root directory
3. Save it

### Step 6: Configure Environment Variables

Open the `.env` file and add the following (see [Configuration](#configuration) section for details):

```bash
# Required: Login credentials for RP.GOB.PA
RP_USERNAME=your_email@example.com
RP_PASSWORD=your_password

# Optional: Default building name
BUILDING_NAME=Ocean Waves

# Optional: Email notifications
ALERT_EMAILS=your-email@example.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com

# Optional: CAPTCHA solving (2Captcha)
CAPTCHA_API_KEY=your-2captcha-api-key
CAPTCHA_PROVIDER=2captcha
CAPTCHA_PLUGIN=1
CAPTCHA_MODE=backup
```

### Step 7: Test the Installation

```bash
# Test that everything is installed correctly
node --version
npm --version

# Try running a simple test (if available)
npm test
```

---

## Installation - Windows

### Step 1: Install Node.js

1. Visit https://nodejs.org/
2. Download the Windows installer (LTS version, `.msi` file)
3. Run the installer:
   - Check "Add to PATH" if prompted
   - Follow the installation wizard
   - Click "Finish" when done
4. **Restart your computer** (important for PATH changes to take effect)
5. Verify installation:
   - Open Command Prompt (Win + R, type `cmd`, press Enter)
   - Run:
     ```cmd
     node --version
     npm --version
     ```

### Step 2: Install Git (if not installed)

1. Visit https://git-scm.com/download/win
2. Download the Git for Windows installer
3. Run the installer with default settings
4. Verify installation:
   ```cmd
   git --version
   ```

### Step 3: Clone or Download the Repository

**Option A: Using Git (Recommended)**

1. Open Command Prompt or PowerShell
2. Navigate to where you want the project:
   ```cmd
   cd C:\Users\YourName\Documents
   ```
3. Clone the repository:
   ```cmd
   git clone <repository-url> panama-scraper
   ```
4. Navigate into the project:
   ```cmd
   cd panama-scraper
   ```

**Option B: Download ZIP**

1. Download the repository as a ZIP file
2. Extract it to `C:\Users\YourName\Documents\panama-scraper` (or your preferred location)
3. Open Command Prompt
4. Navigate to the extracted folder:
   ```cmd
   cd C:\Users\YourName\Documents\panama-scraper
   ```

### Step 4: Install Dependencies

In Command Prompt or PowerShell (run as Administrator if you encounter permission issues):

```cmd
npm install
```

This will:
- Download all Node.js dependencies
- Install Puppeteer (which includes Chromium)
- Set up the project structure

**Note:** This may take 5-10 minutes. If you see permission errors, try:
- Running Command Prompt as Administrator (Right-click → Run as administrator)
- Or use PowerShell instead of Command Prompt

### Step 5: Create Environment File

**Option A: Using Command Prompt**
```cmd
type nul > .env
```

**Option B: Using Notepad**
1. Open Notepad
2. Save an empty file as `.env` in the project root directory
   - **Important:** When saving, change "Save as type" to "All Files (*.*)"
   - The filename should be exactly `.env` (not `.env.txt`)

**Option C: Using VS Code or another editor**
1. Open the project folder in your editor
2. Create a new file named `.env`

### Step 6: Configure Environment Variables

Open the `.env` file in Notepad, VS Code, or any text editor and add:

```bash
# Required: Login credentials for RP.GOB.PA
RP_USERNAME=your_email@example.com
RP_PASSWORD=your_password

# Optional: Default building name
BUILDING_NAME=Ocean Waves

# Optional: Email notifications
ALERT_EMAILS=your-email@example.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com

# Optional: CAPTCHA solving (2Captcha)
CAPTCHA_API_KEY=your-2captcha-api-key
CAPTCHA_PROVIDER=2captcha
CAPTCHA_PLUGIN=1
CAPTCHA_MODE=backup
```

**Windows Note:** Make sure there are no spaces around the `=` sign and no quotes unless the value itself contains spaces.

### Step 7: Test the Installation

```cmd
node --version
npm --version
```

---

## Configuration

### Required Environment Variables

Create a `.env` file in the project root with the following:

```bash
# RP.GOB.PA Login Credentials (REQUIRED)
RP_USERNAME=your_email@example.com
RP_PASSWORD=your_password
```

### Optional Environment Variables

```bash
# Default Building Name
BUILDING_NAME=Ocean Waves
SEARCH_PARAMETER=Ocean Waves

# Maximum properties to process
MAX_PROPERTIES_TO_PROCESS=50

# Headless mode (1 = headless, 0 = show browser)
HEADLESS=0

# Mercantil enrichment
MERCANTIL=0

# Contact search mode
CONTACT_MODE=0
```

### Email Configuration

See [Email Setup](#email-setup) section below for detailed email configuration.

### CAPTCHA Configuration

For automated CAPTCHA solving (optional but recommended):

```bash
CAPTCHA_API_KEY=your-2captcha-api-key
CAPTCHA_PROVIDER=2captcha
CAPTCHA_PLUGIN=1
CAPTCHA_MODE=backup
```

**Getting a 2Captcha API Key:**
1. Sign up at https://2captcha.com/
2. Add funds to your account
3. Go to Settings → API Key
4. Copy your API key to `CAPTCHA_API_KEY` in `.env`

**CAPTCHA_MODE options:**
- `always`: Always solve CAPTCHA before attempting login
- `backup`: Try clicking checkbox first, solve if challenge appears (recommended)
- `off`: Disable CAPTCHA solving

---

## Running the Scrapers

### Main Scraper

Scrapes property data by building name:

**macOS/Linux:**
```bash
# Using default building name from .env
node scraper.js

# With custom building name
node scraper.js --building "Ocean Waves" --search "Ocean Waves"

# With Mercantil enrichment
node scraper.js --building "Ocean Waves" --mercantil 1

# Limit number of properties
node scraper.js --building "Ocean Waves" --max 30
```

**Windows:**
```cmd
node scraper.js

node scraper.js --building "Ocean Waves" --search "Ocean Waves"

node scraper.js --building "Ocean Waves" --mercantil 1

node scraper.js --building "Ocean Waves" --max 30
```

**Output:**
- Main spreadsheet: `BuildingData/{building_name}.xlsx`
- Changes spreadsheet: `BuildingData/{building_name}_changes.xlsx` (if changes detected)

### Finca Scraper

Scrapes prelación (property records) by company/person name:

**macOS/Linux:**
```bash
node lib/finca.js --name "Company Name"
```

**Windows:**
```cmd
node lib/finca.js --name "Company Name"
```

**Output:**
- Main spreadsheet: `BuildingData/{name}_finca.xlsx`
- Changes spreadsheet: `BuildingData/{name}_finca_changes.xlsx` (if changes detected)

### Mercantil Scraper

Enriches corporate owner data:

**macOS/Linux:**
```bash
node lib/mercantil.js
```

**Windows:**
```cmd
node lib/mercantil.js
```

---

## Email Setup

The scrapers can send email notifications on completion. Emails include:
- **Always**: Main spreadsheet attached
- **When changes detected**: Both main spreadsheet and changes spreadsheet attached

### Quick Setup with Gmail

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate an App Password**:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Enter "Panama Scraper" as the name
   - Copy the 16-character password (remove spaces)

3. **Add to `.env` file:**
   ```bash
   # Email recipients (comma or semicolon separated)
   ALERT_EMAILS=your-email@example.com
   
   # Gmail SMTP settings
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=0
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=abcdefghijklmnop  # Your App Password (no spaces)
   SMTP_FROM=your-email@gmail.com
   ```

4. **Test the configuration:**
   ```bash
   node lib/email-test.js
   ```

### Other Email Providers

**SendGrid:**
```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=noreply@yourdomain.com
```

**Outlook/Office 365:**
```bash
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
SMTP_FROM=your-email@outlook.com
```

**AWS SES:**
```bash
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=your-aws-smtp-username
SMTP_PASS=your-aws-smtp-password
SMTP_FROM=your-verified-email@domain.com
```

For detailed Gmail setup instructions, see `docker/GMAIL_SETUP.md`.

---

## Docker Setup (Optional)

Docker allows you to run the scrapers in isolated containers, which is useful for:
- Consistent environments across different machines
- Easy deployment to servers
- Isolated dependencies

### Prerequisites

1. Install Docker Desktop:
   - macOS: https://www.docker.com/products/docker-desktop/
   - Windows: https://www.docker.com/products/docker-desktop/

2. Verify installation:
   ```bash
   docker --version
   docker-compose --version
   ```

### Building Containers

```bash
# Build all containers
docker-compose build

# Build specific container
docker-compose build main
docker-compose build finca
```

### Running with Docker

```bash
# Main scraper
docker-compose --profile main run --rm main --building "Ocean Waves"

# Finca scraper
docker-compose --profile finca run --rm finca --name "Company Name"

# Mercantil scraper
docker-compose --profile mercantil run --rm mercantil
```

### Output Files

Docker containers save files to your local directories:
- `BuildingData/` - Excel spreadsheets
- `debug-output/` - Debug screenshots and HTML
- `session/` - Session cookies
- `logs/` - Log files

For more Docker details, see `docker/README.md` and `docker/QUICK_START.md`.

---

## Troubleshooting

### Common Issues

#### "Command not found: node" or "Command not found: npm"

**Solution:**
- **macOS**: Reinstall Node.js and restart Terminal
- **Windows**: Restart your computer after installing Node.js, or add Node.js to PATH manually

#### "Permission denied" errors on macOS/Linux

**Solution:**
```bash
# Fix npm permissions (macOS/Linux)
sudo chown -R $(whoami) ~/.npm
```

#### Puppeteer fails to launch browser

**Solution:**
- Ensure Chrome/Chromium is installed
- On Linux, you may need additional dependencies:
  ```bash
  sudo apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils
  ```

#### Login fails / CAPTCHA blocking

**Solution:**
1. Enable CAPTCHA solving in `.env`:
   ```bash
   CAPTCHA_API_KEY=your-key
   CAPTCHA_PROVIDER=2captcha
   CAPTCHA_PLUGIN=1
   CAPTCHA_MODE=backup
   ```
2. Or run in non-headless mode to solve manually:
   ```bash
   HEADLESS=0 node scraper.js
   ```

#### Email not sending

**Solution:**
1. Test email configuration:
   ```bash
   node lib/email-test.js
   ```
2. For Gmail, ensure you're using an App Password, not your regular password
3. Check that `ALERT_EMAILS` or `FINCA_EMAIL_RECIPIENTS` is set in `.env`
4. Verify SMTP settings match your email provider

#### "No space left on device" (Docker)

**Solution:**
```bash
# Clean up Docker resources
docker system prune -a --volumes
docker builder prune -a -f
```

#### Module not found errors

**Solution:**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Getting Help

1. Check the logs in `logs/` directory
2. Enable debug mode:
   ```bash
   DEBUG=1 node scraper.js
   ```
3. Check debug output in `debug-output/` directory
4. Review Docker logs:
   ```bash
   docker-compose logs main
   ```

---

## Project Structure

```
panama-scraper/
├── scraper.js              # Main scraper entry point
├── lib/
│   ├── finca.js           # Finca scraper
│   ├── mercantil.js        # Mercantil scraper
│   ├── email.js            # Email notification system
│   ├── changeTracker.js    # Change detection logic
│   └── auth.js             # Authentication helpers
├── BuildingData/           # Output Excel files
├── debug-output/           # Debug screenshots/HTML
├── session/                # Session cookies
├── logs/                   # Log files
├── docker/                 # Docker configuration
├── .env                    # Environment variables (create this)
└── package.json            # Node.js dependencies
```

---

## License

ISC

---

## Support

For issues, questions, or contributions, please refer to the project repository.


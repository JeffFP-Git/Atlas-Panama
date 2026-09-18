# Screen Session Troubleshooting

## Problem: "There is a screen on" but "no screen to be resumed"

This means the screen session is attached in another terminal/SSH session.

## Solutions

### Option 1: Force Detach and Reattach (Recommended)

```bash
# Detach all sessions
screen -D -r 66693.scraper2

# Or force detach
screen -d 66693.scraper2

# Then attach
screen -r 66693.scraper2
```

### Option 2: Kill the Existing Attachment

```bash
# List all screen sessions
screen -ls

# Kill the specific session's attachment
screen -S 66693.scraper2 -X quit

# Or detach it
screen -S 66693.scraper2 -X detach

# Then attach fresh
screen -r 66693.scraper2
```

### Option 3: Create a New Screen Session

If you can't recover the old one:

```bash
# Create new screen session
screen -S scraper

# Or with a specific name
screen -S api-server
```

### Option 4: Use tmux Instead (Alternative)

If screen keeps causing issues, consider using tmux:

```bash
# Install tmux
sudo apt-get update
sudo apt-get install tmux

# Create new session
tmux new -s scraper

# Attach to existing
tmux attach -t scraper

# List sessions
tmux ls

# Detach: Press Ctrl+B, then D
```

## Common Screen Commands

```bash
# List all screen sessions
screen -ls

# Create new screen session
screen -S session-name

# Attach to session
screen -r session-name

# Detach from current session
# Press: Ctrl+A, then D

# Kill a screen session
screen -S session-name -X quit

# Force detach and reattach
screen -D -r session-name
```

## Best Practices

1. **Always detach properly**: Press `Ctrl+A` then `D` before closing terminal
2. **Name your sessions**: `screen -S api-server` instead of just `screen`
3. **Check before creating**: `screen -ls` to see existing sessions
4. **Use systemd for production**: Better than screen for long-running services

## For Production: Use systemd Instead

Screen is fine for development, but for production services, use systemd:

```bash
# Create service file
sudo nano /etc/systemd/system/panama-scraper-api.service

# Add:
[Unit]
Description=Panama Scraper API
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/panama-scraper
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node api.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target

# Enable and start
sudo systemctl enable panama-scraper-api
sudo systemctl start panama-scraper-api

# Check status
sudo systemctl status panama-scraper-api

# View logs
sudo journalctl -u panama-scraper-api -f
```


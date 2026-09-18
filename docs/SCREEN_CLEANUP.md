# Delete All Screen Sessions and Start Fresh

## Delete All Screen Sessions

### Option 1: Kill All Screen Sessions (Recommended)

```bash
# List all screen sessions first (to see what you're deleting)
screen -ls

# Kill all screen sessions
screen -ls | grep Detached | cut -d. -f1 | awk '{print $1}' | xargs -I {} screen -X -S {} quit

# Or kill all (including attached)
screen -ls | grep -oP '\d+\.\S+' | xargs -I {} screen -S {} -X quit
```

### Option 2: Manual Kill Each Session

```bash
# List sessions
screen -ls

# Kill each one individually
screen -S 66693.scraper2 -X quit
screen -S session-name -X quit
# ... repeat for each session
```

### Option 3: Nuclear Option (Kill All)

```bash
# Kill all screen processes (be careful!)
pkill screen

# Or more specifically
killall screen
```

## Verify All Sessions Are Gone

```bash
# Should show "No Sockets found"
screen -ls
```

## Start a New Screen Session

```bash
# Create new session with a descriptive name
screen -S api-server

# Or just
screen -S scraper

# Inside screen, start your API
node api.js

# Detach: Press Ctrl+A, then D
```

## Complete Cleanup Script

```bash
#!/bin/bash
# Clean up all screen sessions and start fresh

echo "📋 Current screen sessions:"
screen -ls

echo ""
echo "🗑️  Killing all screen sessions..."
screen -ls | grep -oP '\d+\.\S+' | while read session; do
    echo "  Killing: $session"
    screen -S "$session" -X quit 2>/dev/null || true
done

echo ""
echo "✅ All sessions killed"
echo ""
echo "📋 Verifying (should be empty):"
screen -ls

echo ""
echo "🚀 Starting new screen session..."
screen -S api-server
```

## Quick One-Liner

```bash
# Kill all and start new in one command
screen -ls | grep -oP '\d+\.\S+' | xargs -I {} screen -S {} -X quit 2>/dev/null; screen -S api-server
```


# How Screen Works - Complete Explanation

## What is Screen?

`screen` is a **terminal multiplexer** - it creates a virtual terminal session that runs independently of your physical terminal connection. Think of it like a "virtual desktop" for your terminal.

## The Problem Screen Solves

**Without screen:**
```
Your Computer → SSH Connection → Terminal Session → Process
                                    ↑
                              If this closes, process dies
```

When you disconnect from SSH or close your terminal:
- Your shell session ends
- All child processes (like your scraper) receive a "hangup" signal
- They terminate

**With screen:**
```
Your Computer → SSH Connection → Screen Session → Process
                                    ↑
                              Can disconnect, process keeps running
                              Reconnect later to same session
```

## How Screen Works Technically

### 1. **Screen Daemon Process**

When you start `screen`, it creates a **daemon process** that runs independently:

```bash
# When you run: screen -S scraper
# Screen creates:
# 1. A daemon process (screen itself)
# 2. A pseudo-terminal (pty) - virtual terminal
# 3. A shell inside that virtual terminal
```

The screen daemon:
- Runs as a background process
- Owns the virtual terminal
- Keeps processes alive even when you disconnect
- Stores session state in `/tmp/screens/` or `~/.screen/`

### 2. **Session Architecture**

```
┌─────────────────────────────────────────┐
│  Screen Daemon Process (persistent)    │
│  ┌───────────────────────────────────┐ │
│  │  Session: "scraper"               │ │
│  │  ┌─────────────────────────────┐  │ │
│  │  │  Window 0 (your terminal)  │  │ │
│  │  │  ┌───────────────────────┐  │  │ │
│  │  │  │  Shell (bash/zsh)     │  │  │ │
│  │  │  │  ┌─────────────────┐  │  │  │ │
│  │  │  │  │ docker-compose  │  │  │  │ │
│  │  │  │  │ (your scraper)   │  │  │  │ │
│  │  │  │  └─────────────────┘  │  │  │ │
│  │  │  └───────────────────────┘  │  │ │
│  │  └─────────────────────────────┘  │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### 3. **Detaching and Attaching**

**Detaching (Ctrl+A then D):**
- Your terminal connection to screen ends
- Screen daemon keeps running
- All processes inside continue
- Session state is saved

**Attaching (screen -r scraper):**
- You reconnect to the same screen daemon
- Screen restores the session state
- You see exactly what was happening
- Can interact with running processes

## Key Concepts

### Sessions

A **session** is an independent screen instance. You can have multiple sessions:

```bash
screen -S scraper      # Session 1
screen -S monitoring   # Session 2
screen -S testing      # Session 3

screen -ls             # List all sessions
```

Each session is completely isolated.

### Windows

Within a session, you can have multiple **windows** (like tabs):

```
Session: scraper
├── Window 0: Running scraper
├── Window 1: Monitoring logs
└── Window 2: Editing config
```

**Window commands:**
- `Ctrl+A` then `C` - Create new window
- `Ctrl+A` then `N` - Next window
- `Ctrl+A` then `P` - Previous window
- `Ctrl+A` then `0-9` - Switch to window number
- `Ctrl+A` then `"` - List all windows

### The Control Key (Ctrl+A)

`Ctrl+A` is screen's **command prefix**. It tells screen "the next key is a command, not input to the program."

**Common commands:**
- `Ctrl+A` then `D` - Detach
- `Ctrl+A` then `K` - Kill window
- `Ctrl+A` then `C` - Create window
- `Ctrl+A` then `?` - Show help
- `Ctrl+A` then `[` - Enter copy mode (scroll back)

**Note:** To send `Ctrl+A` to your program (not screen), press `Ctrl+A` twice: `Ctrl+A` then `A`

## Step-by-Step: What Happens

### Starting Screen

```bash
$ screen -S scraper
```

**What happens:**
1. Screen daemon starts (if not already running)
2. Creates a new session named "scraper"
3. Creates a virtual terminal (pty)
4. Starts a shell (bash/zsh) in that terminal
5. You're now "inside" the screen session
6. Your prompt appears - you're in a shell, but it's virtual

### Running a Command

```bash
$ docker-compose --profile main run --rm main --building "Ocean Waves"
```

**What happens:**
1. Command runs in the virtual terminal
2. Output goes to the virtual terminal
3. Screen captures all output
4. You see it in real-time
5. Process is a child of the screen session's shell

### Detaching

Press: `Ctrl+A` then `D`

**What happens:**
1. Screen receives the detach command
2. Disconnects your terminal from the session
3. **Screen daemon keeps running**
4. **All processes continue**
5. Session state saved
6. You see: `[detached from 12345.scraper]`
7. You're back in your original shell

**Important:** The processes are now owned by the screen daemon, not your terminal session.

### Disconnecting from SSH

```bash
$ exit  # or close terminal, or disconnect
```

**What happens:**
1. Your SSH session ends
2. Your original shell dies
3. **Screen daemon is unaffected** (it's a separate process)
4. **All processes in screen continue running**

### Reconnecting Later

```bash
$ ssh user@ec2-instance
$ screen -r scraper
```

**What happens:**
1. You SSH back in
2. Screen daemon is still running (it never stopped)
3. You reattach to the same session
4. Screen restores the terminal state
5. You see the output that happened while you were gone
6. You can interact with the process again

## Visual Timeline Example

```
Time 0:00 - You start screen
┌─────────────────┐
│ screen -S scraper │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Inside screen   │
│ $ docker-compose│
│ Starting...     │
└─────────────────┘

Time 0:05 - You detach (Ctrl+A, D)
┌─────────────────┐
│ [detached]      │
│ Back to shell   │
└─────────────────┘
         │
         ▼ (screen daemon still running)
┌─────────────────┐
│ Screen session  │
│ docker-compose  │
│ Still running!  │
└─────────────────┘

Time 0:10 - You disconnect SSH
┌─────────────────┐
│ SSH closed      │
│ (screen daemon  │
│  still running) │
└─────────────────┘

Time 1:00 - You reconnect
┌─────────────────┐
│ $ screen -r scraper │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Reattached!     │
│ docker-compose  │
│ [output from    │
│  while you were │
│  gone]          │
└─────────────────┘
```

## Why Screen Persists

Screen persists because:

1. **Separate Process:** Screen daemon is a separate process, not tied to your terminal
2. **Process Ownership:** Processes inside screen are children of the screen daemon, not your shell
3. **No Hangup Signal:** When your terminal closes, screen doesn't receive SIGHUP
4. **Session Storage:** Screen saves session state to disk

## Comparison: Screen vs Other Methods

### Screen vs nohup

**nohup:**
- Process runs, but you can't see output interactively
- Must check log files
- Can't reattach to see live output

**screen:**
- Can reattach and see live output
- Can interact with the process
- Better for monitoring

### Screen vs tmux

**screen:**
- Simpler, lighter
- More universal (installed by default on many systems)
- Older, more stable

**tmux:**
- More features (panes, better scripting)
- More modern
- Slightly more complex

Both work similarly for basic use cases.

## Common Screen Workflows

### Workflow 1: Long-Running Process

```bash
# Start
screen -S scraper
docker-compose --profile main run --rm main --building "Ocean Waves"

# Detach (Ctrl+A, D)
# Disconnect SSH
# ... hours later ...

# Reconnect
ssh user@ec2
screen -r scraper  # See what happened
```

### Workflow 2: Multiple Tasks

```bash
# Session 1: Main scraper
screen -S main
docker-compose --profile main run --rm main --building "Ocean Waves"
# Detach (Ctrl+A, D)

# Session 2: Finca scraper
screen -S finca
docker-compose --profile finca run --rm finca --name "Company"
# Detach (Ctrl+A, D)

# Check both
screen -r main    # See main scraper
screen -r finca   # See finca scraper
```

### Workflow 3: Monitoring While Running

```bash
screen -S scraper
docker-compose --profile main run --rm main --building "Ocean Waves"

# In another terminal (or another window in same session):
screen -r scraper
# Press Ctrl+A then C to create new window
# Now you have 2 windows - one running scraper, one for monitoring
```

## Troubleshooting Screen

### "There is no screen to be resumed"

**Problem:** Screen session doesn't exist or was killed.

**Solution:**
```bash
# Check if screen daemon is running
ps aux | grep screen

# List all sessions
screen -ls

# If session shows as "Attached" but you can't connect:
screen -d -r scraper  # Force detach and reattach
```

### "There are several suitable screens"

**Problem:** Multiple sessions with same name or multiple windows.

**Solution:**
```bash
# List all sessions
screen -ls

# Attach to specific session ID
screen -r 12345.scraper

# Or kill duplicate sessions first
screen -S scraper -X quit
```

### Screen Session Died

**Problem:** Screen daemon was killed (system reboot, manual kill, etc.)

**Solution:**
- Screen sessions don't survive reboots
- Use systemd services for processes that need to survive reboots
- Or use screen with a startup script that auto-restarts

### Can't Detach

**Problem:** Ctrl+A not working or program capturing keys.

**Solution:**
```bash
# Try: Ctrl+A then A then D (double A)
# Or kill the window: Ctrl+A then K
# Or from another terminal:
screen -S scraper -X quit
```

## Advanced Screen Features

### Split Windows (Regions)

```bash
Ctrl+A then S  # Split horizontally
Ctrl+A then |  # Split vertically (if supported)
Ctrl+A then Tab  # Switch between regions
Ctrl+A then Q  # Close all regions except current
```

### Copy Mode (Scroll Back)

```bash
Ctrl+A then [  # Enter copy mode
# Use arrow keys to scroll
# Space to start selection
# Arrow keys to extend selection
# Enter to copy
Ctrl+A then ]  # Paste
```

### Logging

```bash
Ctrl+A then H  # Start/stop logging
# Logs saved to screenlog.0, screenlog.1, etc.
```

### Sharing Sessions

```bash
# User 1: Start session with multiuser
screen -S scraper -multiuser

# User 1: Give permission
screen -S scraper -X acladd user2

# User 2: Attach to shared session
screen -x scraper
```

## Best Practices

1. **Name Your Sessions:** Always use `-S <name>` for easy identification
2. **Check Before Creating:** Use `screen -ls` to avoid duplicates
3. **Detach Properly:** Always use `Ctrl+A, D` - don't just close terminal
4. **Monitor Sessions:** Regularly check `screen -ls` for orphaned sessions
5. **Clean Up:** Kill unused sessions: `screen -S name -X quit`

## Quick Reference Card

```
Starting:
  screen -S <name>           # Start named session
  screen -r <name>            # Reattach to session
  screen -ls                 # List all sessions

Inside Screen:
  Ctrl+A then D              # Detach
  Ctrl+A then C              # New window
  Ctrl+A then N              # Next window
  Ctrl+A then P              # Previous window
  Ctrl+A then K              # Kill window
  Ctrl+A then ?              # Help
  Ctrl+A then [              # Scroll back
  Ctrl+A then A              # Send Ctrl+A to program

From Outside:
  screen -r <name>            # Reattach
  screen -d -r <name>        # Force detach then reattach
  screen -S <name> -X quit   # Kill session
  screen -S <name> -X stuff "command^M"  # Send command
```

## Handling Multiple Screen Sessions

### The Problem: Which Session to Connect To?

When you have multiple screen sessions running, screen needs to know which one you want to connect to. Here's how it works:

### Listing All Sessions

```bash
$ screen -ls
There are screens on:
    12345.scraper      (Attached)
    12346.finca        (Detached)
    12347.monitoring   (Detached)
    12348.test         (Detached)
4 Sockets in /tmp/screens/S-username.
```

**Understanding the output:**
- `12345.scraper` - Format: `<PID>.<session-name>`
- `(Attached)` - Someone/something is currently connected to this session
- `(Detached)` - Session exists but no one is connected
- `(Multi attached)` - Multiple people connected (if multiuser mode enabled)

### How Screen Identifies Sessions

Screen uses **two identifiers** for each session:

1. **Session ID (PID)** - The process ID, e.g., `12345`
2. **Session Name** - The name you gave it with `-S`, e.g., `scraper`

You can connect using either:
```bash
screen -r scraper        # By name
screen -r 12345          # By PID
screen -r 12345.scraper  # Full ID (most specific)
```

### Connecting to a Specific Session

**By Name (if unique):**
```bash
screen -r scraper
```

**By Full Session ID (most reliable):**
```bash
screen -r 12345.scraper
```

**By PID only:**
```bash
screen -r 12345
```

### What If the Name is Ambiguous?

If you have multiple sessions with similar names:

```bash
$ screen -r scraper
There are several suitable screens on:
    12345.scraper-main    (Detached)
    12346.scraper-finca   (Detached)
    12347.scraper         (Detached)
```

**Screen will show this error** and ask you to be more specific.

**Solution:** Use the full session ID:
```bash
screen -r 12345.scraper-main
# or just the PID
screen -r 12345
```

### Real-World Example

```bash
# Start multiple sessions
$ screen -S main-scraper
# ... run command, detach (Ctrl+A, D)

$ screen -S finca-scraper  
# ... run command, detach (Ctrl+A, D)

$ screen -S monitoring
# ... run command, detach (Ctrl+A, D)

# List all sessions
$ screen -ls
There are screens on:
    12345.main-scraper    (Detached)
    12346.finca-scraper   (Detached)
    12347.monitoring      (Detached)

# Connect to the one you want
$ screen -r main-scraper
# or
$ screen -r 12345
```

### Force Detach and Reattach

If a session shows as "Attached" but you can't connect (maybe from a crashed SSH connection):

```bash
# Force detach first, then reattach
screen -d -r scraper

# Or in two steps
screen -d scraper      # Detach it (force)
screen -r scraper      # Then reattach
```

### Switching Between Multiple Sessions

**Method 1: Detach and Reattach**
```bash
# Currently in session 1
Ctrl+A, D  # Detach

# List all sessions
screen -ls

# Attach to different session
screen -r other-session
```

**Method 2: Multiple Terminal Windows**
```bash
# Terminal window 1
screen -r main-scraper

# Terminal window 2 (new SSH connection or new terminal)
screen -r finca-scraper
```

**Method 3: Multiple SSH Connections**
```bash
# SSH connection 1
screen -r main-scraper

# SSH connection 2 (new connection to same server)
screen -r finca-scraper
```

### Managing Multiple Sessions

**Kill a specific session:**
```bash
# From outside screen (by name)
screen -S scraper -X quit

# By full session ID
screen -S 12345.scraper -X quit

# By PID only
screen -S 12345 -X quit
```

**Send a command to a detached session (without attaching):**
```bash
# Send a command to a detached session
screen -S scraper -X stuff "echo hello^M"
# ^M represents Enter (Ctrl+M)
```

**Check what's running in a session (without attaching):**
```bash
# Capture current screen content to a file
screen -S scraper -X hardcopy /tmp/screen-output.txt
cat /tmp/screen-output.txt
```

### Best Practices for Multiple Sessions

1. **Use Descriptive, Unique Names:**
   ```bash
   screen -S main-scraper-ocean-waves
   screen -S finca-company-name
   screen -S monitoring-logs
   ```

2. **List Before Creating:**
   ```bash
   screen -ls  # Check existing sessions
   screen -S new-unique-name  # Create with unique name
   ```

3. **Keep Session List Clean:**
   ```bash
   # Periodically check for dead/unused sessions
   screen -ls
   
   # Kill unused sessions
   screen -S old-session -X quit
   ```

4. **Use Consistent Naming Patterns:**
   ```bash
   # Good: Include date or purpose
   screen -S scraper-main-$(date +%Y%m%d)
   screen -S scraper-finca-company-name
   ```

### Common Scenarios with Multiple Sessions

**Scenario 1: "There are several suitable screens"**
```bash
$ screen -r scraper
There are several suitable screens on:
    12345.scraper    (Detached)
    12346.scraper    (Detached)

# Solution: Be more specific
screen -r 12345.scraper
# or rename one of them first
screen -S 12345.scraper -X sessionname scraper-main
screen -S 12346.scraper -X sessionname scraper-finca
```

**Scenario 2: Session shows as "Attached" but you're not connected**

This is a common issue when your SSH connection crashes or was closed improperly. Screen thinks the session is still attached, but no one is actually connected.

**Solution: Force detach, then reattach**

```bash
# Option 1: Force detach and reattach in one command
screen -d -r scraper

# Option 2: Force detach first, then reattach separately
screen -d scraper      # Force detach
screen -r scraper      # Then reattach

# Option 3: Force detach by session ID
screen -d 66693.scraper2
screen -r 66693.scraper2
```

**Example with your specific sessions:**

```bash
# Force detach scraper2
screen -d 66693.scraper2

# Now you can reattach
screen -r scraper2
# or
screen -r 66693.scraper2

# Do the same for the other sessions if needed
screen -d 67226.scraper
screen -r 67226.scraper
```

**Scenario 3: Too many sessions, can't find the right one**
```bash
# List with more detail
screen -ls

# Or check each one quickly
for session in $(screen -ls | grep Detached | awk '{print $1}'); do
    echo "=== $session ==="
    screen -S $session -X hardcopy /tmp/$session.txt
    head -5 /tmp/$session.txt
    echo ""
done
```

**Scenario 4: Want to see all sessions at once**
```bash
# You can't, but you can quickly switch:
# Terminal 1: screen -r session1
# Terminal 2: screen -r session2
# Terminal 3: screen -r session3
```

### Quick Reference for Multiple Sessions

```bash
# List all sessions
screen -ls

# Connect by name (if unique)
screen -r scraper

# Connect by full ID (most reliable)
screen -r 12345.scraper

# Connect by PID only
screen -r 12345

# Force detach and reattach
screen -d -r scraper

# Kill a session
screen -S scraper -X quit
screen -S 12345.scraper -X quit

# Rename a session
screen -S 12345.scraper -X sessionname new-name
```

## Summary

**Screen works by:**
1. Creating a persistent daemon process
2. Running your commands in a virtual terminal owned by that daemon
3. Allowing you to detach/reattach to that virtual terminal
4. Keeping processes alive because they're children of the daemon, not your shell

**Key takeaway:** Screen = Virtual terminal that survives disconnection. Your processes run inside it, so they survive too.

**Multiple Sessions:**
- Each session has a unique ID: `<PID>.<name>`
- Use `screen -ls` to see all sessions
- Connect using name, PID, or full ID
- Use descriptive names to avoid confusion
- Force detach with `-d` if session is stuck as "Attached"


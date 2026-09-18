# Fixing Docker Permission Errors

If you see `PermissionError: [Errno 13] Permission denied` when running Docker commands, your user doesn't have permission to access the Docker socket.

## Solution: Add User to Docker Group

### Step 1: Add your user to the docker group

```bash
sudo usermod -aG docker $USER
```

### Step 2: Apply the group changes

You need to log out and log back in, OR use:

```bash
newgrp docker
```

### Step 3: Verify it works

```bash
docker ps
```

If this works without `sudo`, you're all set!

### Step 4: Test docker-compose

```bash
docker-compose version
```

## Alternative: Fix Socket Permissions (Not Recommended)

If you can't add the user to the docker group, you can temporarily fix socket permissions:

```bash
sudo chmod 666 /var/run/docker.sock
```

**Warning:** This is less secure and permissions may reset after Docker restarts.

## Verify Docker is Running

Make sure Docker daemon is running:

```bash
sudo systemctl status docker
```

If it's not running:

```bash
sudo systemctl start docker
sudo systemctl enable docker  # Start on boot
```

## Troubleshooting

### Still getting permission errors?

1. **Check if you're in the docker group:**
   ```bash
   groups
   ```
   You should see `docker` in the list.

2. **Check Docker socket permissions:**
   ```bash
   ls -l /var/run/docker.sock
   ```
   Should show something like: `srw-rw---- 1 root docker`

3. **Restart Docker service:**
   ```bash
   sudo systemctl restart docker
   ```

4. **Log out and log back in** (group changes require a new session)

### Using sudo (Not Recommended)

If you must use sudo temporarily:

```bash
sudo docker-compose run --rm finca --name "Company Name"
```

**Note:** Files created by sudo will be owned by root, which can cause permission issues later.

## After Fixing Permissions

Once permissions are fixed, you can run:

```bash
# Build images
docker-compose build

# Run services
./docker/run.sh finca --name "Company Name"
docker-compose run --rm mercantil --name "Company Name"
```


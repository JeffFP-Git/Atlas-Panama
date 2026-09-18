# Clean Rebuild Docker Containers

When `docker-compose build` isn't picking up changes, you need to force a clean rebuild.

## Quick Clean Rebuild

```bash
# Stop and remove containers
docker-compose down

# Check what images exist (Docker Compose names them differently)
docker images | grep panama

# Remove the specific image (if it exists)
# Docker Compose uses format: <project>_<service>
docker rmi panama-scraper_main 2>/dev/null || true

# Or remove all project images (recommended)
docker-compose down --rmi all

# Rebuild from scratch (no cache)
docker-compose build --no-cache main
```

## Complete Clean Rebuild (Most Thorough)

If the above doesn't work, do a complete cleanup:

```bash
# 1. Stop and remove all containers
docker-compose down

# 2. Remove all images for this project
docker-compose down --rmi all

# 3. Remove build cache (optional but thorough)
docker builder prune -a -f

# 4. Rebuild from scratch
docker-compose build --no-cache main
```

## Step-by-Step Commands

### Step 1: Stop Running Containers

```bash
# Stop all containers
docker-compose stop

# Or stop specific service
docker-compose stop main
```

### Step 2: Remove Containers

```bash
# Remove stopped containers
docker-compose rm -f main

# Or remove all containers
docker-compose down
```

### Step 3: Remove Images

```bash
# List images to find the right one
docker images | grep panama-scraper

# Remove specific image
docker rmi panama-scraper-main

# Or remove all project images
docker-compose down --rmi all
```

### Step 4: Clean Build Cache (Optional)

```bash
# Remove all build cache
docker builder prune -a -f

# Or just unused cache
docker builder prune -f
```

### Step 5: Rebuild from Scratch

```bash
# Rebuild with no cache
docker-compose build --no-cache main

# Or rebuild all services
docker-compose build --no-cache
```

## One-Liner Commands

**Quick clean rebuild (recommended):**
```bash
docker-compose down --rmi all && docker-compose build --no-cache main
```

**Complete clean rebuild:**
```bash
docker-compose down --rmi all && docker builder prune -a -f && docker-compose build --no-cache main
```

**Note:** The `--rmi all` flag removes all images created by docker-compose, so you don't need to manually remove them.

## Verify the Rebuild

After rebuilding, verify the image was updated:

```bash
# Check image creation time
docker images panama-scraper-main

# Check image details
docker inspect panama-scraper-main | grep Created
```

## Common Issues

### "Image is being used by a container"

**Problem:** Can't remove image because container is still running.

**Solution:**
```bash
# Stop and remove containers first
docker-compose down

# Then remove image
docker rmi panama-scraper-main
```

### "No space left on device"

**Problem:** Docker cache is taking up too much space.

**Solution:**
```bash
# Clean up everything
docker system prune -a --volumes

# Then rebuild
docker-compose build --no-cache main
```

### Still Not Updating

**Problem:** Changes still not reflected after rebuild.

**Solution:**
1. **Check you're in the right directory:**
   ```bash
   pwd
   ls -la docker-compose.yml
   ```

2. **Verify files were actually changed:**
   ```bash
   git status
   # or
   ls -la scraper.js
   ```

3. **Check Dockerfile is being used:**
   ```bash
   cat Dockerfile.main
   ```

4. **Rebuild with verbose output:**
   ```bash
   docker-compose build --no-cache --progress=plain main
   ```

## Rebuild and Run in One Command

After cleaning, you can rebuild and run:

```bash
# Clean rebuild and run
docker-compose down && \
docker rmi panama-scraper-main && \
docker-compose build --no-cache main && \
docker-compose --profile main run --rm main --building "Biltmore"
```

## For All Services

If you need to clean rebuild all services:

```bash
# Stop everything
docker-compose down

# Remove all images
docker-compose down --rmi all

# Clean cache
docker builder prune -a -f

# Rebuild all
docker-compose build --no-cache
```

## Check What's Using Space

Before cleaning, see what's taking up space:

```bash
# Docker disk usage
docker system df

# Detailed breakdown
docker system df -v
```

## Best Practices

1. **Always use `--no-cache` when you've changed code:**
   ```bash
   docker-compose build --no-cache main
   ```

2. **Clean up regularly to save space:**
   ```bash
   docker system prune -a
   ```

3. **Check image dates after rebuild:**
   ```bash
   docker images panama-scraper-main
   ```

4. **Use `docker-compose down` instead of `docker-compose stop`:**
   - `stop` - Stops containers but keeps them
   - `down` - Stops and removes containers

## Quick Reference

```bash
# Stop and remove containers
docker-compose down

# Remove specific image
docker rmi panama-scraper-main

# Remove all project images
docker-compose down --rmi all

# Clean build cache
docker builder prune -a -f

# Rebuild from scratch
docker-compose build --no-cache main

# Rebuild and run
docker-compose build --no-cache main && \
docker-compose --profile main run --rm main --building "Biltmore"
```


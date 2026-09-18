# Docker for Cross-Platform Consistency

## What Docker Guarantees

Docker containers provide **significant consistency improvements** but not 100% guarantees. Here's what you get:

### ✅ What Docker Solves

1. **Same Node.js version** - Your container uses Node 20, regardless of host OS
2. **Same dependencies** - `npm ci` installs exact versions from `package-lock.json`
3. **Same Chrome/Chromium** - Container installs the same browser version
4. **Same file paths** - `/app` is consistent inside the container
5. **Same environment variables** - Loaded from `.env` consistently
6. **Isolated execution** - No interference from host system packages

### ⚠️ What Can Still Vary

1. **Network conditions** - EC2 might have different latency/bandwidth
2. **Timing issues** - Race conditions may behave differently
3. **Resource limits** - CPU/memory constraints can affect behavior
4. **File system** - Some hosts have slower I/O
5. **DNS resolution** - Different network configurations
6. **Time zones** - Container uses host timezone (can be set)

## Best Practices for Maximum Consistency

### 1. Use Docker Compose (Recommended)

```bash
# Same command works everywhere
docker-compose run --rm finca --name "Company Name"
```

### 2. Pin Versions Explicitly

Your Dockerfiles already do this:
- Node.js 20 (specific version)
- Chrome/Chromium (from official repos)
- npm ci (uses package-lock.json)

### 3. Set Resource Limits

Add to `docker-compose.yml`:

```yaml
services:
  finca:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

### 4. Use Consistent Timeouts

Make sure all timeouts are generous enough for slower networks:

```javascript
// In your code, use consistent timeouts
await page.waitForSelector('...', { timeout: 30000 }); // 30s everywhere
```

### 5. Handle Network Differences

```javascript
// Add retry logic for network operations
async function retryOperation(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await sleep(1000 * (i + 1)); // Exponential backoff
    }
  }
}
```

## Common EC2 vs Local Differences (Even with Docker)

### Issue: Timing/Race Conditions

**Problem:** EC2 might be slower, causing timeouts

**Solution:**
```yaml
# docker-compose.yml
services:
  finca:
    environment:
      - PUPPETEER_TIMEOUT=60000  # Increase timeouts
```

### Issue: Memory Constraints

**Problem:** EC2 instance might have less RAM

**Solution:**
```yaml
services:
  finca:
    deploy:
      resources:
        limits:
          memory: 2G  # Set explicit limit
    # Or use --memory flag
    # docker run --memory=2g ...
```

### Issue: File System Performance

**Problem:** EC2 EBS volumes can be slower

**Solution:**
- Use faster EBS volume types (gp3 instead of gp2)
- Consider mounting `/tmp` to faster storage
- Use volumes for persistent data

### Issue: Network Latency

**Problem:** EC2 might have different network conditions

**Solution:**
- Add retry logic (already in your code)
- Increase timeouts for network operations
- Use connection pooling where possible

## Testing Consistency

### 1. Test Locally First

```bash
# Test in Docker locally
docker-compose run --rm finca --name "Test Company"
```

### 2. Test on EC2

```bash
# Same command on EC2
docker-compose run --rm finca --name "Test Company"
```

### 3. Compare Results

- Check output files are identical
- Compare logs for timing differences
- Verify same data extracted

## Docker Compose for Consistency

Your `docker-compose.yml` already helps with consistency:

```yaml
services:
  finca:
    environment:
      - NODE_ENV=production  # Same environment
      - HEADLESS=1           # Same headless mode
    volumes:
      - ./.env:/app/.env:ro  # Same config
```

## Additional Consistency Tips

### 1. Use .dockerignore

Already configured - prevents local files from affecting container

### 2. Build Images on Each Platform

```bash
# Build on EC2 (not just pull)
docker-compose build finca
```

### 3. Use Multi-Stage Builds (Optional)

For even more consistency, you could use multi-stage builds to ensure exact same build environment.

### 4. Set Timezone Explicitly

```yaml
services:
  finca:
    environment:
      - TZ=America/Panama  # Or UTC
```

### 5. Log Everything

```yaml
services:
  finca:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

## Debugging Differences

If behavior still differs:

### 1. Check Docker Versions

```bash
docker --version
docker-compose --version
```

### 2. Compare Container Environments

```bash
# On local
docker-compose run --rm finca env > local-env.txt

# On EC2
docker-compose run --rm finca env > ec2-env.txt

# Compare
diff local-env.txt ec2-env.txt
```

### 3. Check Resource Usage

```bash
# Monitor container resources
docker stats panama-scraper-finca
```

### 4. Compare Logs

```bash
# Check for timing differences
docker-compose logs finca | grep -i timeout
docker-compose logs finca | grep -i error
```

## Recommendation

**Yes, Docker will significantly improve consistency**, but:

1. **Use Docker Compose** for all runs (don't mix local node and Docker)
2. **Set resource limits** to match your EC2 instance
3. **Increase timeouts** for network operations
4. **Test locally in Docker first** before deploying to EC2
5. **Monitor logs** to identify any remaining differences

## Quick Checklist

- [ ] Use `docker-compose` for all runs (local and EC2)
- [ ] Build images on each platform (don't assume they're identical)
- [ ] Set explicit resource limits
- [ ] Use consistent timeouts in code
- [ ] Test with same data on both platforms
- [ ] Compare logs when issues occur
- [ ] Use volumes for persistent data (not bind mounts for code)

## Example: Fully Containerized Workflow

```bash
# Local development
docker-compose build finca
docker-compose run --rm finca --name "Test Company"

# EC2 production (same commands)
docker-compose build finca
docker-compose run --rm finca --name "Production Company"
```

This ensures maximum consistency between platforms.


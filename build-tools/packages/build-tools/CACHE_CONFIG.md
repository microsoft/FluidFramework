# Shared Cache Configuration

The shared cache can be configured through multiple sources with the following precedence order:

**CLI flags > Environment variables > Configuration file > Defaults**

## Configuration File

Create a `.fluid-build-cache.json` file in your repository root to configure cache behavior:

```json
{
  "cacheDir": ".fluid-build-cache",
  "skipCacheWrite": false,
  "verifyCacheIntegrity": false,
  "maxCacheSizeMB": 5000,
  "maxCacheAgeDays": 30,
  "autoPrune": false
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cacheDir` | string | `.fluid-build-cache` | Path to cache directory (absolute or relative to config file) |
| `skipCacheWrite` | boolean | `false` | Read from cache but don't write to it (read-only mode) |
| `verifyCacheIntegrity` | boolean | `false` | Verify file hashes when restoring from cache (adds overhead) |
| `maxCacheSizeMB` | number | `5000` | Maximum cache size in MB for automatic pruning |
| `maxCacheAgeDays` | number | `30` | Maximum cache entry age in days for pruning |
| `autoPrune` | boolean | `false` | Automatically prune cache during cleanup operations |

### Path Resolution

- **Absolute paths**: Used as-is (e.g., `/home/user/cache`)
- **Relative paths**: Resolved relative to the directory containing `.fluid-build-cache.json`
- **Example**: If config is in `/home/user/project/.fluid-build-cache.json` and `cacheDir` is `../shared-cache`, the resolved path is `/home/user/shared-cache`

### Configuration File Location

The configuration file is searched starting from the current working directory and walking up the directory tree until one is found or the root is reached. This allows:

- **Project-specific config**: Place in repository root
- **User-wide config**: Place in home directory
- **System-wide config**: Place in system root (not recommended)

## Command-Line Flags

Override configuration file settings with CLI flags:

```bash
# Specify cache directory
fluid-build --cache-dir /path/to/cache

# Enable read-only mode
fluid-build --cache-dir .cache --skip-cache-write

# Enable integrity verification
fluid-build --cache-dir .cache --verify-cache-integrity

# Cache management commands
fluid-build --cache-dir .cache --cache-stats       # Show statistics
fluid-build --cache-dir .cache --cache-clean       # Remove all entries
fluid-build --cache-dir .cache --cache-prune       # Prune old entries
fluid-build --cache-dir .cache --cache-verify      # Verify integrity
fluid-build --cache-dir .cache --cache-verify-fix  # Fix corrupted entries

# Pruning options
fluid-build --cache-dir .cache --cache-prune --cache-prune-size 3000      # Max 3GB
fluid-build --cache-dir .cache --cache-prune --cache-prune-age 14         # Max 14 days
```

## Environment Variables

Set cache configuration via environment variables:

```bash
# Linux/macOS
export FLUID_BUILD_CACHE_DIR=/path/to/cache
fluid-build

# Windows (PowerShell)
$env:FLUID_BUILD_CACHE_DIR="C:\path\to\cache"
fluid-build

# Windows (CMD)
set FLUID_BUILD_CACHE_DIR=C:\path\to\cache
fluid-build
```

Environment variables currently supported:
- `FLUID_BUILD_CACHE_DIR`: Path to cache directory

## Precedence Examples

### Example 1: CLI Override

**Config file** (`.fluid-build-cache.json`):
```json
{
  "cacheDir": ".cache",
  "skipCacheWrite": false
}
```

**Command**:
```bash
fluid-build --cache-dir /tmp/cache --skip-cache-write
```

**Result**: Uses `/tmp/cache` (CLI) and `skipCacheWrite: true` (CLI)

### Example 2: Environment + Config

**Config file**:
```json
{
  "cacheDir": ".cache",
  "verifyCacheIntegrity": true
}
```

**Environment**:
```bash
export FLUID_BUILD_CACHE_DIR=/home/user/.cache
```

**Command**:
```bash
fluid-build
```

**Result**: Uses `/home/user/.cache` (env) and `verifyCacheIntegrity: true` (config)

### Example 3: All Defaults

**No config file, no environment, no CLI flags**

**Command**:
```bash
fluid-build
```

**Result**: Cache is **disabled** (no default `cacheDir`)

## Best Practices

### 1. Team Configuration

For teams, commit a `.fluid-build-cache.json` to your repository:

```json
{
  "cacheDir": ".fluid-build-cache",
  "maxCacheSizeMB": 10000,
  "maxCacheAgeDays": 60
}
```

Add `.fluid-build-cache/` to `.gitignore`:
```
.fluid-build-cache/
```

### 2. CI/CD Pipelines

Use environment variables in CI to point to shared cache:

```yaml
# GitHub Actions example
- name: Build with cache
  env:
    FLUID_BUILD_CACHE_DIR: /tmp/fluid-cache
  run: pnpm run build
```

### 3. Developer Overrides

Developers can override team settings without modifying the config file:

```bash
# Use local cache instead of shared
fluid-build --cache-dir ~/.fluid-cache

# Disable cache writes during experimentation
fluid-build --skip-cache-write
```

### 4. Cache Maintenance

Set up automatic maintenance:

```json
{
  "cacheDir": ".cache",
  "maxCacheSizeMB": 5000,
  "maxCacheAgeDays": 30,
  "autoPrune": true
}
```

Or run manual cleanup:
```bash
# Weekly cron job
0 0 * * 0 fluid-build --cache-dir .cache --cache-prune
```

### 5. Shared Team Cache

For shared network caches:

```json
{
  "cacheDir": "/mnt/shared/fluid-cache",
  "skipCacheWrite": false,
  "verifyCacheIntegrity": true
}
```

**Note**: Verify filesystem supports atomic renames (most network filesystems do)

### 6. Read-Only Cache

For CI or build analysis:

```json
{
  "cacheDir": "/readonly/cache",
  "skipCacheWrite": true,
  "verifyCacheIntegrity": true
}
```

## Configuration Validation

The configuration file is validated on load. Common errors:

### Invalid JSON
```
Error: Failed to parse config file as JSON: Unexpected token } in JSON at position 42
```
**Fix**: Validate JSON syntax with a linter

### Invalid Type
```
Error: Invalid configuration in .fluid-build-cache.json:
  maxCacheSizeMB must be a number, got string
```
**Fix**: Use correct types per schema

### Unknown Property
```
Warning: Invalid configuration in .fluid-build-cache.json:
  Unknown property: cacheDirr
```
**Fix**: Check spelling against documented options

### Invalid Value
```
Error: Invalid configuration in .fluid-build-cache.json:
  maxCacheSizeMB must be positive, got -100
```
**Fix**: Use valid values (positive numbers, valid paths)

## Troubleshooting

### Cache Not Loading

1. Check if config file exists:
   ```bash
   find . -name .fluid-build-cache.json
   ```

2. Validate JSON syntax:
   ```bash
   cat .fluid-build-cache.json | jq .
   ```

3. Check for error messages in build output

### Precedence Issues

Enable debug logging to see configuration resolution:

```bash
DEBUG=fluid-build:cache:init fluid-build
```

Output shows:
- Config file location (if found)
- Configuration values from each source
- Final merged configuration

### Permission Issues

If cache directory creation fails:

```bash
# Check permissions
ls -ld /path/to/cache/parent

# Fix permissions
chmod 755 /path/to/cache/parent
```

## Schema Reference

Full TypeScript schema:

```typescript
interface CacheConfigFile {
  cacheDir?: string;
  skipCacheWrite?: boolean;
  verifyCacheIntegrity?: boolean;
  maxCacheSizeMB?: number;
  maxCacheAgeDays?: number;
  autoPrune?: boolean;
}
```

All fields are optional. Missing fields use default values.

## Migration Guide

### From Environment Variables Only

**Before**:
```bash
export FLUID_BUILD_CACHE_DIR=/path/to/cache
fluid-build
```

**After** (create `.fluid-build-cache.json`):
```json
{
  "cacheDir": "/path/to/cache"
}
```

### From CLI Flags Only

**Before**:
```json
{
  "scripts": {
    "build": "fluid-build --cache-dir .cache"
  }
}
```

**After** (create `.fluid-build-cache.json`):
```json
{
  "cacheDir": ".cache"
}
```

Update `package.json`:
```json
{
  "scripts": {
    "build": "fluid-build"
  }
}
```

## See Also

- [Shared Cache Design](./SHARED_CACHE_DESIGN.md) - Architecture and design decisions
- [Debug Logging](./DEBUG_LOGGING.md) - Troubleshooting with debug logs
- [Implementation Status](./IMPLEMENTATION_STATUS.md) - Current implementation status

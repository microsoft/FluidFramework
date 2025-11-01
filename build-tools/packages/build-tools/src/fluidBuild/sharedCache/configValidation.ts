/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import * as path from "path";

/**
 * Validation result for cache configuration
 */
export interface ValidationResult {
	/**
	 * Whether the validation succeeded
	 */
	valid: boolean;

	/**
	 * Error message if validation failed
	 */
	error?: string;

	/**
	 * Warning messages (non-fatal issues)
	 */
	warnings?: string[];
}

/**
 * Information about available disk space
 */
export interface DiskSpaceInfo {
	/**
	 * Available space in bytes
	 */
	available: number;

	/**
	 * Total space in bytes
	 */
	total: number;

	/**
	 * Used space in bytes
	 */
	used: number;

	/**
	 * Percentage of disk space used (0-100)
	 */
	percentUsed: number;
}

/**
 * Minimum recommended free disk space in bytes (1 GB)
 */
const MIN_FREE_SPACE_BYTES = 1024 * 1024 * 1024;

/**
 * Warning threshold for disk space percentage
 */
const DISK_SPACE_WARNING_PERCENT = 90;

/**
 * Validates that a cache directory path is valid and usable
 *
 * @param cacheDir - The cache directory path to validate
 * @returns Validation result indicating success or failure with error message
 */
export function validateCacheDirectory(cacheDir: string): ValidationResult {
	const warnings: string[] = [];

	// Check if path is empty or invalid
	if (!cacheDir || cacheDir.trim() === "") {
		return {
			valid: false,
			error: "Cache directory path cannot be empty",
		};
	}

	// Check if path is absolute before resolving
	if (!path.isAbsolute(cacheDir)) {
		return {
			valid: false,
			error: `Cache directory must be an absolute path, got: ${cacheDir}`,
		};
	}

	// Normalize and resolve the path
	const normalizedPath = path.resolve(cacheDir);

	// Check for path length issues (Windows has 260 char limit)
	if (process.platform === "win32" && normalizedPath.length > 240) {
		warnings.push(
			"Cache directory path is very long and may cause issues on Windows (>240 characters)",
		);
	}

	// Check for invalid characters in path
	if (hasInvalidPathCharacters(normalizedPath)) {
		return {
			valid: false,
			error: `Cache directory path contains invalid characters: ${normalizedPath}`,
		};
	}

	// Check if path points to a system directory
	if (isSystemDirectory(normalizedPath)) {
		return {
			valid: false,
			error: `Cache directory cannot be a system directory: ${normalizedPath}`,
		};
	}

	return {
		valid: true,
		warnings: warnings.length > 0 ? warnings : undefined,
	};
}

/**
 * Checks if a cache directory exists and creates it if necessary
 *
 * @param cacheDir - The cache directory path
 * @returns Validation result indicating success or failure with error message
 */
export function ensureCacheDirectoryExists(cacheDir: string): ValidationResult {
	const normalizedPath = path.resolve(cacheDir);

	try {
		// Check if directory exists
		if (fs.existsSync(normalizedPath)) {
			// Verify it's actually a directory
			const stats = fs.statSync(normalizedPath);
			if (!stats.isDirectory()) {
				return {
					valid: false,
					error: `Cache directory path exists but is not a directory: ${normalizedPath}`,
				};
			}
			return { valid: true };
		}

		// Try to create the directory
		fs.mkdirSync(normalizedPath, { recursive: true });
		return { valid: true };
	} catch (error) {
		return {
			valid: false,
			error: `Failed to create cache directory ${normalizedPath}: ${(error as Error).message}`,
		};
	}
}

/**
 * Validates that the cache directory has appropriate read/write permissions
 *
 * @param cacheDir - The cache directory path
 * @returns Validation result indicating success or failure with error message
 */
export function validateCacheDirectoryPermissions(cacheDir: string): ValidationResult {
	const normalizedPath = path.resolve(cacheDir);

	// Check if directory exists
	if (!fs.existsSync(normalizedPath)) {
		return {
			valid: false,
			error: `Cache directory does not exist: ${normalizedPath}. Call ensureCacheDirectoryExists() first.`,
		};
	}

	try {
		// Test write permission by creating a temporary file
		const testFile = path.join(normalizedPath, `.write-test-${Date.now()}`);
		try {
			fs.writeFileSync(testFile, "test");
		} catch (error) {
			return {
				valid: false,
				error: `Cache directory is not writable: ${normalizedPath}. Error: ${(error as Error).message}`,
			};
		}

		// Test read permission
		try {
			fs.readFileSync(testFile);
		} catch (error) {
			return {
				valid: false,
				error: `Cache directory is not readable: ${normalizedPath}. Error: ${(error as Error).message}`,
			};
		} finally {
			// Clean up test file
			try {
				fs.unlinkSync(testFile);
			} catch {
				// Ignore cleanup errors
			}
		}

		// Check directory permissions using fs.access (if supported)
		try {
			fs.accessSync(normalizedPath, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
		} catch (error) {
			return {
				valid: false,
				error: `Insufficient permissions for cache directory: ${normalizedPath}. Need read, write, and execute permissions.`,
			};
		}

		return { valid: true };
	} catch (error) {
		return {
			valid: false,
			error: `Failed to validate permissions for ${normalizedPath}: ${(error as Error).message}`,
		};
	}
}

/**
 * Gets information about available disk space for the cache directory
 *
 * @param cacheDir - The cache directory path
 * @returns Disk space information or undefined if unable to determine
 */
export function getDiskSpaceInfo(cacheDir: string): DiskSpaceInfo | undefined {
	const normalizedPath = path.resolve(cacheDir);

	try {
		// Use statfs on Unix-like systems, or diskusage module would be better but
		// we'll use a simpler approach checking the filesystem
		if (process.platform === "win32") {
			// On Windows, we can't easily get disk space without external modules
			// Return undefined to indicate we can't determine it
			return undefined;
		}

		// On Unix-like systems, we can use statfs via fs.statfs (Node 18.15+)
		// For older Node versions, this won't be available
		// Since we require Node >=20.15.1, we can use it
		const stats = fs.statfsSync ? fs.statfsSync(normalizedPath) : undefined;
		if (!stats) {
			return undefined;
		}

		const blockSize = stats.bsize;
		const available = stats.bavail * blockSize;
		const total = stats.blocks * blockSize;
		const used = total - available;
		const percentUsed = total > 0 ? Math.round((used / total) * 100) : 0;

		return {
			available,
			total,
			used,
			percentUsed,
		};
	} catch {
		// If we can't determine disk space, return undefined
		return undefined;
	}
}

/**
 * Validates that sufficient disk space is available for the cache
 *
 * @param cacheDir - The cache directory path
 * @returns Validation result with warnings if disk space is low
 */
export function validateDiskSpace(cacheDir: string): ValidationResult {
	const warnings: string[] = [];

	const diskInfo = getDiskSpaceInfo(cacheDir);
	if (!diskInfo) {
		// Can't determine disk space (e.g., on Windows or old Node)
		// Don't fail validation, just skip the check
		return { valid: true };
	}

	// Check if available space is below minimum threshold
	if (diskInfo.available < MIN_FREE_SPACE_BYTES) {
		const availableGB = (diskInfo.available / (1024 * 1024 * 1024)).toFixed(2);
		warnings.push(
			`Low disk space: Only ${availableGB} GB available. Consider freeing up space or running cache cleanup.`,
		);
	}

	// Check if disk usage percentage is high
	if (diskInfo.percentUsed >= DISK_SPACE_WARNING_PERCENT) {
		warnings.push(
			`Disk is ${diskInfo.percentUsed}% full. Consider freeing up space or running cache cleanup.`,
		);
	}

	return {
		valid: true,
		warnings: warnings.length > 0 ? warnings : undefined,
	};
}

/**
 * Performs comprehensive validation of cache configuration
 *
 * @param cacheDir - The cache directory path to validate
 * @param createIfMissing - Whether to create the directory if it doesn't exist (default: true)
 * @returns Validation result with any errors or warnings
 */
export function validateCacheConfiguration(
	cacheDir: string,
	createIfMissing = true,
): ValidationResult {
	const warnings: string[] = [];

	// Step 1: Validate the path itself
	const pathValidation = validateCacheDirectory(cacheDir);
	if (!pathValidation.valid) {
		return pathValidation;
	}
	if (pathValidation.warnings) {
		warnings.push(...pathValidation.warnings);
	}

	// Step 2: Ensure directory exists (or create it)
	if (createIfMissing) {
		const existsValidation = ensureCacheDirectoryExists(cacheDir);
		if (!existsValidation.valid) {
			return existsValidation;
		}
		if (existsValidation.warnings) {
			warnings.push(...existsValidation.warnings);
		}
	} else {
		const normalizedPath = path.resolve(cacheDir);
		if (!fs.existsSync(normalizedPath)) {
			return {
				valid: false,
				error: `Cache directory does not exist: ${normalizedPath}`,
			};
		}
	}

	// Step 3: Validate permissions
	const permissionsValidation = validateCacheDirectoryPermissions(cacheDir);
	if (!permissionsValidation.valid) {
		return permissionsValidation;
	}
	if (permissionsValidation.warnings) {
		warnings.push(...permissionsValidation.warnings);
	}

	// Step 4: Check disk space
	const diskSpaceValidation = validateDiskSpace(cacheDir);
	if (!diskSpaceValidation.valid) {
		return diskSpaceValidation;
	}
	if (diskSpaceValidation.warnings) {
		warnings.push(...diskSpaceValidation.warnings);
	}

	return {
		valid: true,
		warnings: warnings.length > 0 ? warnings : undefined,
	};
}

/**
 * Checks if a path contains invalid characters for the current platform
 */
function hasInvalidPathCharacters(pathStr: string): boolean {
	if (process.platform === "win32") {
		// Windows invalid characters: < > : " | ? *
		// Note: We allow backslash since it's the path separator
		return /[<>:"|?*]/.test(pathStr);
	}
	// Unix-like systems only disallow null character
	return pathStr.includes("\0");
}

/**
 * Checks if a path points to a protected system directory
 */
function isSystemDirectory(pathStr: string): boolean {
	const normalized = path.resolve(pathStr).toLowerCase();

	// Common system directories to protect
	const systemDirs = [
		path.resolve("/").toLowerCase(),
		path.resolve("/bin").toLowerCase(),
		path.resolve("/boot").toLowerCase(),
		path.resolve("/dev").toLowerCase(),
		path.resolve("/etc").toLowerCase(),
		path.resolve("/lib").toLowerCase(),
		path.resolve("/proc").toLowerCase(),
		path.resolve("/sbin").toLowerCase(),
		path.resolve("/sys").toLowerCase(),
		path.resolve("/usr").toLowerCase(),
		path.resolve("/var").toLowerCase(),
	];

	// Windows system directories
	if (process.platform === "win32") {
		const windir = process.env.WINDIR || "C:\\Windows";
		const systemRoot = process.env.SystemRoot || "C:\\Windows";
		const programFiles = process.env.ProgramFiles || "C:\\Program Files";
		const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

		systemDirs.push(
			path.resolve(windir).toLowerCase(),
			path.resolve(systemRoot).toLowerCase(),
			path.resolve(programFiles).toLowerCase(),
			path.resolve(programFilesX86).toLowerCase(),
			path.resolve("C:\\").toLowerCase(),
		);
	}

	// macOS-specific system directories
	if (process.platform === "darwin") {
		systemDirs.push(
			path.resolve("/System").toLowerCase(),
			path.resolve("/Library").toLowerCase(),
			path.resolve("/Applications").toLowerCase(),
		);
	}

	// Check if the path exactly matches a system directory
	return systemDirs.includes(normalized);
}

/**
 * Formats a validation result into a human-readable message
 *
 * @param result - The validation result to format
 * @returns Formatted error/warning message or empty string if valid with no warnings
 */
export function formatValidationMessage(result: ValidationResult): string {
	if (!result.valid && result.error) {
		return `ERROR: ${result.error}`;
	}

	if (result.warnings && result.warnings.length > 0) {
		return `WARNING: ${result.warnings.join("\nWARNING: ")}`;
	}

	return "";
}

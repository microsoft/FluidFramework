/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import fs from "node:fs";

/**
 * Configuration file schema for .fluid-build-cache.json
 */
export interface CacheConfigFile {
	/**
	 * Cache directory path (absolute or relative to config file location)
	 */
	cacheDir?: string;

	/**
	 * Skip writing to cache (read-only mode)
	 */
	skipCacheWrite?: boolean;

	/**
	 * Verify file integrity when restoring from cache
	 */
	verifyCacheIntegrity?: boolean;

	/**
	 * Maximum cache size in MB (for automatic pruning)
	 */
	maxCacheSizeMB?: number;

	/**
	 * Maximum cache entry age in days (for automatic pruning)
	 */
	maxCacheAgeDays?: number;

	/**
	 * Automatically prune cache on cleanup operations
	 */
	autoPrune?: boolean;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<CacheConfigFile> = {
	cacheDir: ".fluid-build-cache",
	skipCacheWrite: false,
	verifyCacheIntegrity: false, // This maps to verifyIntegrity in SharedCacheOptions
	maxCacheSizeMB: 5000, // 5 GB
	maxCacheAgeDays: 30,
	autoPrune: false,
};

/**
 * Configuration file name
 */
export const CONFIG_FILE_NAME = ".fluid-build-cache.json";

/**
 * Validation error for configuration files
 */
export class ConfigValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigValidationError";
	}
}

/**
 * Validates a cache configuration object
 *
 * @param config - Configuration object to validate
 * @param configPath - Path to config file for error messages
 * @returns Validation errors (empty array if valid)
 */
export function validateConfigFile(config: unknown): string[] {
	const errors: string[] = [];

	if (typeof config !== "object" || config === null) {
		errors.push(`Configuration must be an object, got ${typeof config}`);
		return errors;
	}

	const cfg = config as Record<string, unknown>;

	// Validate cacheDir
	if ("cacheDir" in cfg) {
		if (typeof cfg.cacheDir !== "string") {
			errors.push(`cacheDir must be a string, got ${typeof cfg.cacheDir}`);
		} else if (cfg.cacheDir.trim() === "") {
			errors.push("cacheDir cannot be empty");
		}
	}

	// Validate boolean flags
	for (const flag of ["skipCacheWrite", "verifyCacheIntegrity", "autoPrune"]) {
		if (flag in cfg && typeof cfg[flag] !== "boolean") {
			errors.push(`${flag} must be a boolean, got ${typeof cfg[flag]}`);
		}
	}

	// Validate numeric values
	for (const field of ["maxCacheSizeMB", "maxCacheAgeDays"]) {
		if (field in cfg) {
			if (typeof cfg[field] !== "number") {
				errors.push(`${field} must be a number, got ${typeof cfg[field]}`);
			} else if (!Number.isFinite(cfg[field] as number)) {
				errors.push(`${field} must be finite, got ${cfg[field]}`);
			} else if ((cfg[field] as number) <= 0) {
				errors.push(`${field} must be positive, got ${cfg[field]}`);
			}
		}
	}

	// Check for unknown properties
	const knownProps = new Set([
		"cacheDir",
		"skipCacheWrite",
		"verifyCacheIntegrity",
		"maxCacheSizeMB",
		"maxCacheAgeDays",
		"autoPrune",
	]);

	for (const prop of Object.keys(cfg)) {
		if (!knownProps.has(prop)) {
			errors.push(`Unknown property: ${prop}`);
		}
	}

	return errors;
}

/**
 * Loads and parses a cache configuration file
 *
 * @param configPath - Path to the configuration file
 * @returns Parsed configuration object or null if file doesn't exist
 * @throws ConfigValidationError if the file is invalid
 */
export function loadConfigFile(configPath: string): CacheConfigFile | null {
	// Check if file exists
	if (!fs.existsSync(configPath)) {
		return null;
	}

	// Read and parse the file
	let content: string;
	try {
		content = fs.readFileSync(configPath, "utf-8");
	} catch (error) {
		throw new ConfigValidationError(`Failed to read config file: ${(error as Error).message}`);
	}

	let config: unknown;
	try {
		config = JSON.parse(content);
	} catch (error) {
		throw new ConfigValidationError(
			`Failed to parse config file as JSON: ${(error as Error).message}`,
		);
	}

	// Validate the configuration
	const errors = validateConfigFile(config);
	if (errors.length > 0) {
		throw new ConfigValidationError(
			`Invalid configuration in ${configPath}:\n  ${errors.join("\n  ")}`,
		);
	}

	return config as CacheConfigFile;
}

/**
 * Searches for a configuration file starting from a directory and walking up
 *
 * @param startDir - Directory to start searching from
 * @returns Path to the configuration file or null if not found
 */
export function findConfigFile(startDir: string): string | null {
	let currentDir = path.resolve(startDir);
	const root = path.parse(currentDir).root;

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const configPath = path.join(currentDir, CONFIG_FILE_NAME);
		if (fs.existsSync(configPath)) {
			return configPath;
		}

		// Stop at root directory
		if (currentDir === root) {
			break;
		}

		// Move up one directory
		currentDir = path.dirname(currentDir);
	}

	return null;
}

/**
 * Resolves cache directory path relative to config file location
 *
 * @param cacheDir - Cache directory from config (may be relative or absolute)
 * @param configDir - Directory containing the config file
 * @returns Absolute path to cache directory
 */
export function resolveCacheDir(cacheDir: string, configDir: string): string {
	if (path.isAbsolute(cacheDir)) {
		return cacheDir;
	}
	return path.resolve(configDir, cacheDir);
}

/**
 * Configurable subset of SharedCacheOptions (excludes runtime-provided fields)
 */
export interface ConfigurableCacheOptions {
	cacheDir: string;
	skipCacheWrite?: boolean;
	verifyIntegrity?: boolean;
}

/**
 * Merges configuration from multiple sources with precedence:
 * CLI flags > Environment variables > Config file > Defaults
 *
 * @param cliOptions - Options from command-line flags
 * @param envOptions - Options from environment variables
 * @param fileConfig - Configuration from .fluid-build-cache.json
 * @param configDir - Directory containing the config file (for relative path resolution)
 * @returns Merged configurable cache options
 */
export function mergeConfiguration(
	cliOptions: Partial<ConfigurableCacheOptions>,
	envOptions: Partial<ConfigurableCacheOptions>,
	fileConfig: CacheConfigFile | null,
	configDir?: string,
): ConfigurableCacheOptions {
	// Start with defaults
	const merged: ConfigurableCacheOptions = {
		cacheDir: DEFAULT_CONFIG.cacheDir,
		skipCacheWrite: DEFAULT_CONFIG.skipCacheWrite,
		verifyIntegrity: DEFAULT_CONFIG.verifyCacheIntegrity,
	};

	// Apply file config (if exists)
	if (fileConfig !== null) {
		if (fileConfig.cacheDir !== undefined) {
			// Resolve relative paths against config file directory
			merged.cacheDir = configDir
				? resolveCacheDir(fileConfig.cacheDir, configDir)
				: fileConfig.cacheDir;
		}
		if (fileConfig.skipCacheWrite !== undefined) {
			merged.skipCacheWrite = fileConfig.skipCacheWrite;
		}
		if (fileConfig.verifyCacheIntegrity !== undefined) {
			merged.verifyIntegrity = fileConfig.verifyCacheIntegrity;
		}
	}

	// Apply environment variables (override file config)
	if (envOptions.cacheDir !== undefined) {
		merged.cacheDir = envOptions.cacheDir;
	}
	if (envOptions.skipCacheWrite !== undefined) {
		merged.skipCacheWrite = envOptions.skipCacheWrite;
	}
	if (envOptions.verifyIntegrity !== undefined) {
		merged.verifyIntegrity = envOptions.verifyIntegrity;
	}

	// Apply CLI options (highest precedence)
	if (cliOptions.cacheDir !== undefined) {
		merged.cacheDir = cliOptions.cacheDir;
	}
	if (cliOptions.skipCacheWrite !== undefined) {
		merged.skipCacheWrite = cliOptions.skipCacheWrite;
	}
	if (cliOptions.verifyIntegrity !== undefined) {
		merged.verifyIntegrity = cliOptions.verifyIntegrity;
	}

	return merged;
}

/**
 * Loads cache configuration with proper precedence handling
 *
 * @param cliOptions - Options from command-line flags
 * @param searchDir - Directory to start searching for config file (defaults to cwd)
 * @returns Merged configuration options
 */
export function loadCacheConfiguration(
	cliOptions: Partial<ConfigurableCacheOptions>,
	searchDir: string = process.cwd(),
): ConfigurableCacheOptions {
	// Get environment variables
	const envOptions: Partial<ConfigurableCacheOptions> = {};
	if (process.env.FLUID_BUILD_CACHE_DIR) {
		envOptions.cacheDir = process.env.FLUID_BUILD_CACHE_DIR;
	}

	// Search for config file
	const configPath = findConfigFile(searchDir);
	let fileConfig: CacheConfigFile | null = null;
	let configDir: string | undefined;

	if (configPath !== null) {
		try {
			fileConfig = loadConfigFile(configPath);
			configDir = path.dirname(configPath);
		} catch (error) {
			// Log warning but continue with defaults
			console.warn(
				`Warning: Failed to load cache config from ${configPath}: ${(error as Error).message}`,
			);
		}
	}

	// Merge all configuration sources
	return mergeConfiguration(cliOptions, envOptions, fileConfig, configDir);
}

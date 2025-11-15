/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	type CacheConfigFile,
	ConfigValidationError,
	type ConfigurableCacheOptions,
	findConfigFile,
	loadCacheConfiguration,
	loadConfigFile,
	mergeConfiguration,
	resolveCacheDir,
	validateConfigFile,
} from "../../fluidBuild/sharedCache/configFile.js";

describe("configFile", () => {
	let tempDir: string;

	beforeEach(() => {
		// Create a unique temp directory for each test
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
	});

	afterEach(() => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	describe("validateConfigFile", () => {
		it("should accept valid configuration", () => {
			const config: CacheConfigFile = {
				cacheDir: ".cache",
				skipCacheWrite: false,
				verifyCacheIntegrity: true,
				maxCacheSizeMB: 5000,
				maxCacheAgeDays: 30,
				autoPrune: false,
			};
			const errors = validateConfigFile(config);
			assert.equal(errors.length, 0);
		});

		it("should accept empty configuration", () => {
			const config = {};
			const errors = validateConfigFile(config);
			assert.equal(errors.length, 0);
		});

		it("should reject non-object configuration", () => {
			const errors = validateConfigFile("not an object");
			assert.equal(errors.length, 1);
			assert.match(errors[0], /must be an object/);
		});

		it("should reject null configuration", () => {
			const errors = validateConfigFile(null);
			assert.equal(errors.length, 1);
			assert.match(errors[0], /must be an object/);
		});

		it("should reject invalid cacheDir type", () => {
			const config = { cacheDir: 123 };
			const errors = validateConfigFile(config);
			assert.equal(errors.length, 1);
			assert.match(errors[0], /cacheDir must be a string/);
		});

		it("should reject empty cacheDir", () => {
			const config = { cacheDir: "   " };
			const errors = validateConfigFile(config);
			assert.equal(errors.length, 1);
			assert.match(errors[0], /cacheDir cannot be empty/);
		});

		it("should reject invalid boolean flags", () => {
			const config = {
				skipCacheWrite: "yes",
				verifyCacheIntegrity: 1,
				autoPrune: "true",
			};
			const errors = validateConfigFile(config);
			assert.equal(errors.length, 3);
			assert.match(errors[0], /skipCacheWrite must be a boolean/);
			assert.match(errors[1], /verifyCacheIntegrity must be a boolean/);
			assert.match(errors[2], /autoPrune must be a boolean/);
		});

		it("should reject invalid numeric values", () => {
			const config = {
				maxCacheSizeMB: "5000",
				maxCacheAgeDays: true,
			};
			const errors = validateConfigFile(config);
			assert.equal(errors.length, 2);
			assert.match(errors[0], /maxCacheSizeMB must be a number/);
			assert.match(errors[1], /maxCacheAgeDays must be a number/);
		});

		it("should reject negative numeric values", () => {
			const config = {
				maxCacheSizeMB: -100,
				maxCacheAgeDays: 0,
			};
			const errors = validateConfigFile(config);
			assert.equal(errors.length, 2);
			assert.match(errors[0], /maxCacheSizeMB must be positive/);
			assert.match(errors[1], /maxCacheAgeDays must be positive/);
		});

		it("should reject infinite numeric values", () => {
			const config = {
				maxCacheSizeMB: Number.POSITIVE_INFINITY,
				maxCacheAgeDays: Number.NEGATIVE_INFINITY,
			};
			const errors = validateConfigFile(config);
			assert.equal(errors.length, 2);
			assert.match(errors[0], /maxCacheSizeMB must be finite/);
			assert.match(errors[1], /maxCacheAgeDays must be finite/);
		});

		it("should warn about unknown properties", () => {
			const config = {
				cacheDir: ".cache",
				unknownProp: "value",
				anotherUnknown: 123,
			};
			const errors = validateConfigFile(config);
			assert.equal(errors.length, 2);
			assert.match(errors[0], /Unknown property: unknownProp/);
			assert.match(errors[1], /Unknown property: anotherUnknown/);
		});
	});

	describe("loadConfigFile", () => {
		it("should return null for non-existent file", () => {
			const nonExistent = path.join(tempDir, "nonexistent.json");
			const config = loadConfigFile(nonExistent);
			assert.equal(config, null);
		});

		it("should load valid configuration file", () => {
			const configPath = path.join(tempDir, ".fluid-build-cache.json");
			const configContent: CacheConfigFile = {
				cacheDir: ".cache",
				skipCacheWrite: true,
				maxCacheSizeMB: 3000,
			};
			fs.writeFileSync(configPath, JSON.stringify(configContent));

			const config = loadConfigFile(configPath);
			assert.notEqual(config, null);
			assert.equal(config?.cacheDir, ".cache");
			assert.equal(config?.skipCacheWrite, true);
			assert.equal(config?.maxCacheSizeMB, 3000);
		});

		it("should throw on invalid JSON", () => {
			const configPath = path.join(tempDir, ".fluid-build-cache.json");
			fs.writeFileSync(configPath, "{ invalid json }");

			assert.throws(() => {
				loadConfigFile(configPath);
			}, ConfigValidationError);
		});

		it("should throw on invalid configuration", () => {
			const configPath = path.join(tempDir, ".fluid-build-cache.json");
			fs.writeFileSync(configPath, JSON.stringify({ cacheDir: 123 }));

			assert.throws(() => {
				loadConfigFile(configPath);
			}, ConfigValidationError);
		});

		it("should include file path in error message", () => {
			const configPath = path.join(tempDir, ".fluid-build-cache.json");
			fs.writeFileSync(configPath, JSON.stringify({ unknownField: "value" }));

			try {
				loadConfigFile(configPath);
				assert.fail("Should have thrown");
			} catch (error: unknown) {
				assert.ok(error instanceof ConfigValidationError);
				assert.match((error as Error).message, new RegExp(configPath));
			}
		});
	});

	describe("findConfigFile", () => {
		it("should find config in current directory", () => {
			const configPath = path.join(tempDir, ".fluid-build-cache.json");
			fs.writeFileSync(configPath, "{}");

			const found = findConfigFile(tempDir);
			assert.equal(found, configPath);
		});

		it("should find config in parent directory", () => {
			const subDir = path.join(tempDir, "subdir");
			fs.mkdirSync(subDir);
			const configPath = path.join(tempDir, ".fluid-build-cache.json");
			fs.writeFileSync(configPath, "{}");

			const found = findConfigFile(subDir);
			assert.equal(found, configPath);
		});

		it("should find config in grandparent directory", () => {
			const subDir = path.join(tempDir, "sub1", "sub2");
			fs.mkdirSync(subDir, { recursive: true });
			const configPath = path.join(tempDir, ".fluid-build-cache.json");
			fs.writeFileSync(configPath, "{}");

			const found = findConfigFile(subDir);
			assert.equal(found, configPath);
		});

		it("should return null if config not found", () => {
			const subDir = path.join(tempDir, "subdir");
			fs.mkdirSync(subDir);

			const found = findConfigFile(subDir);
			assert.equal(found, null);
		});

		it("should prefer closest config file", () => {
			const subDir = path.join(tempDir, "subdir");
			fs.mkdirSync(subDir);

			const parentConfig = path.join(tempDir, ".fluid-build-cache.json");
			const childConfig = path.join(subDir, ".fluid-build-cache.json");

			fs.writeFileSync(parentConfig, "{}");
			fs.writeFileSync(childConfig, "{}");

			const found = findConfigFile(subDir);
			assert.equal(found, childConfig);
		});
	});

	describe("resolveCacheDir", () => {
		it("should keep absolute paths unchanged", () => {
			const absolutePath = path.resolve("/tmp/cache");
			const resolved = resolveCacheDir(absolutePath, tempDir);
			assert.equal(resolved, absolutePath);
		});

		it("should resolve relative paths", () => {
			const configDir = path.join(tempDir, "config");
			const resolved = resolveCacheDir(".cache", configDir);
			assert.equal(resolved, path.join(configDir, ".cache"));
		});

		it("should resolve parent directory paths", () => {
			const configDir = path.join(tempDir, "project", "config");
			const resolved = resolveCacheDir("../../cache", configDir);
			assert.equal(resolved, path.join(tempDir, "cache"));
		});

		it("should handle nested relative paths", () => {
			const configDir = path.join(tempDir, "config");
			const resolved = resolveCacheDir("../shared/cache", configDir);
			assert.equal(resolved, path.join(tempDir, "shared", "cache"));
		});
	});

	describe("mergeConfiguration", () => {
		it("should use defaults when no config provided", () => {
			const merged = mergeConfiguration({}, {}, null);
			assert.equal(merged.cacheDir, ".fluid-build-cache");
			assert.equal(merged.skipCacheWrite, false);
			assert.equal(merged.verifyIntegrity, false);
		});

		it("should apply file config over defaults", () => {
			const fileConfig: CacheConfigFile = {
				cacheDir: ".custom-cache",
				skipCacheWrite: true,
			};
			const merged = mergeConfiguration({}, {}, fileConfig, tempDir);
			assert.equal(merged.cacheDir, path.join(tempDir, ".custom-cache"));
			assert.equal(merged.skipCacheWrite, true);
			assert.equal(merged.verifyIntegrity, false);
		});

		it("should apply env config over file config", () => {
			const fileConfig: CacheConfigFile = {
				cacheDir: ".file-cache",
				skipCacheWrite: false,
			};
			const envOptions: Partial<ConfigurableCacheOptions> = {
				cacheDir: ".env-cache",
			};
			const merged = mergeConfiguration({}, envOptions, fileConfig, tempDir);
			assert.equal(merged.cacheDir, ".env-cache");
			assert.equal(merged.skipCacheWrite, false);
		});

		it("should apply CLI config over all others", () => {
			const fileConfig: CacheConfigFile = {
				cacheDir: ".file-cache",
				skipCacheWrite: false,
				verifyCacheIntegrity: false,
			};
			const envOptions: Partial<ConfigurableCacheOptions> = {
				cacheDir: ".env-cache",
				skipCacheWrite: true,
			};
			const cliOptions: Partial<ConfigurableCacheOptions> = {
				cacheDir: ".cli-cache",
				verifyIntegrity: true,
			};
			const merged = mergeConfiguration(cliOptions, envOptions, fileConfig, tempDir);
			assert.equal(merged.cacheDir, ".cli-cache");
			assert.equal(merged.skipCacheWrite, true); // from env
			assert.equal(merged.verifyIntegrity, true); // from cli
		});

		it("should resolve relative paths in file config", () => {
			const fileConfig: CacheConfigFile = {
				cacheDir: "../shared-cache",
			};
			const merged = mergeConfiguration({}, {}, fileConfig, tempDir);
			assert.equal(merged.cacheDir, path.join(path.dirname(tempDir), "shared-cache"));
		});

		it("should not resolve paths from env or CLI", () => {
			const fileConfig: CacheConfigFile = {
				cacheDir: "../file-cache",
			};
			const envOptions: Partial<ConfigurableCacheOptions> = {
				cacheDir: "../env-cache",
			};
			const merged = mergeConfiguration({}, envOptions, fileConfig, tempDir);
			assert.equal(merged.cacheDir, "../env-cache"); // not resolved
		});
	});

	describe("loadCacheConfiguration", () => {
		it("should load configuration from file", () => {
			const configPath = path.join(tempDir, ".fluid-build-cache.json");
			const configContent: CacheConfigFile = {
				cacheDir: ".test-cache",
				skipCacheWrite: true,
			};
			fs.writeFileSync(configPath, JSON.stringify(configContent));

			const config = loadCacheConfiguration({}, tempDir);
			assert.equal(config.cacheDir, path.join(tempDir, ".test-cache"));
			assert.equal(config.skipCacheWrite, true);
		});

		it("should handle CLI overrides", () => {
			const configPath = path.join(tempDir, ".fluid-build-cache.json");
			fs.writeFileSync(
				configPath,
				JSON.stringify({
					cacheDir: ".file-cache",
					skipCacheWrite: false,
				}),
			);

			const config = loadCacheConfiguration(
				{
					cacheDir: ".cli-cache",
					verifyIntegrity: true,
				},
				tempDir,
			);
			assert.equal(config.cacheDir, ".cli-cache");
			assert.equal(config.skipCacheWrite, false); // from file
			assert.equal(config.verifyIntegrity, true); // from cli
		});

		it("should handle environment variables", () => {
			const originalEnv = process.env.FLUID_BUILD_CACHE_DIR;
			try {
				process.env.FLUID_BUILD_CACHE_DIR = "/tmp/env-cache";

				const config = loadCacheConfiguration({}, tempDir);
				assert.equal(config.cacheDir, "/tmp/env-cache");
			} finally {
				if (originalEnv === undefined) {
					delete process.env.FLUID_BUILD_CACHE_DIR;
				} else {
					process.env.FLUID_BUILD_CACHE_DIR = originalEnv;
				}
			}
		});

		it("should gracefully handle invalid config file", () => {
			const configPath = path.join(tempDir, ".fluid-build-cache.json");
			fs.writeFileSync(configPath, "{ invalid json");

			// Should not throw, just warn and use defaults
			const config = loadCacheConfiguration({}, tempDir);
			assert.equal(config.cacheDir, ".fluid-build-cache");
		});

		it("should use defaults when no config found", () => {
			const config = loadCacheConfiguration({}, tempDir);
			assert.equal(config.cacheDir, ".fluid-build-cache");
			assert.equal(config.skipCacheWrite, false);
			assert.equal(config.verifyIntegrity, false);
		});

		it("should search parent directories for config", () => {
			const subDir = path.join(tempDir, "sub1", "sub2");
			fs.mkdirSync(subDir, { recursive: true });

			const configPath = path.join(tempDir, ".fluid-build-cache.json");
			fs.writeFileSync(
				configPath,
				JSON.stringify({
					cacheDir: ".parent-cache",
				}),
			);

			const config = loadCacheConfiguration({}, subDir);
			assert.equal(config.cacheDir, path.join(tempDir, ".parent-cache"));
		});
	});
});

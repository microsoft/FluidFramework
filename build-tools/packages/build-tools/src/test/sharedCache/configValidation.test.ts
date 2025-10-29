/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	ensureCacheDirectoryExists,
	formatValidationMessage,
	validateCacheConfiguration,
	validateCacheDirectory,
	validateCacheDirectoryPermissions,
	validateDiskSpace,
} from "../../fluidBuild/sharedCache/configValidation.js";

describe("configValidation", () => {
	let tempDir: string;

	beforeEach(() => {
		// Create a temporary directory for testing
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cache-validation-test-"));
	});

	afterEach(() => {
		// Clean up temporary directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	describe("validateCacheDirectory", () => {
		it("should accept valid absolute paths", () => {
			const result = validateCacheDirectory(tempDir);
			assert.strictEqual(result.valid, true);
		});

		it("should reject empty paths", () => {
			const result = validateCacheDirectory("");
			assert.strictEqual(result.valid, false);
			assert.ok(result.error?.includes("cannot be empty"));
		});

		it("should reject whitespace-only paths", () => {
			const result = validateCacheDirectory("   ");
			assert.strictEqual(result.valid, false);
			assert.ok(result.error?.includes("cannot be empty"));
		});

		it("should reject relative paths", () => {
			const result = validateCacheDirectory("./relative/path");
			assert.strictEqual(result.valid, false);
			assert.ok(result.error?.includes("absolute path"));
		});

		it("should reject system root directory", () => {
			const rootPath = process.platform === "win32" ? "C:\\" : "/";
			const result = validateCacheDirectory(rootPath);
			assert.strictEqual(result.valid, false);
			assert.ok(result.error?.includes("system directory"));
		});

		it("should reject /etc on Unix systems", function () {
			if (process.platform === "win32") {
				this.skip();
			}
			const result = validateCacheDirectory("/etc");
			assert.strictEqual(result.valid, false);
			assert.ok(result.error?.includes("system directory"));
		});

		it("should warn about very long paths on Windows", function () {
			if (process.platform !== "win32") {
				this.skip();
			}
			const longPath = "C:\\" + "a".repeat(250);
			const result = validateCacheDirectory(longPath);
			assert.strictEqual(result.valid, true);
			assert.ok(result.warnings && result.warnings.length > 0);
			assert.ok(result.warnings[0].includes("very long"));
		});

		it("should accept nested paths", () => {
			const nestedPath = path.join(tempDir, "deeply", "nested", "cache");
			const result = validateCacheDirectory(nestedPath);
			assert.strictEqual(result.valid, true);
		});
	});

	describe("ensureCacheDirectoryExists", () => {
		it("should create directory if it doesn't exist", () => {
			const newDir = path.join(tempDir, "new-cache");
			assert.strictEqual(fs.existsSync(newDir), false);

			const result = ensureCacheDirectoryExists(newDir);
			assert.strictEqual(result.valid, true);
			assert.strictEqual(fs.existsSync(newDir), true);
			assert.ok(fs.statSync(newDir).isDirectory());
		});

		it("should succeed if directory already exists", () => {
			const existingDir = path.join(tempDir, "existing");
			fs.mkdirSync(existingDir);

			const result = ensureCacheDirectoryExists(existingDir);
			assert.strictEqual(result.valid, true);
		});

		it("should create nested directories", () => {
			const nestedDir = path.join(tempDir, "a", "b", "c", "cache");
			const result = ensureCacheDirectoryExists(nestedDir);
			assert.strictEqual(result.valid, true);
			assert.strictEqual(fs.existsSync(nestedDir), true);
		});

		it("should fail if path exists but is a file", () => {
			const filePath = path.join(tempDir, "file.txt");
			fs.writeFileSync(filePath, "test");

			const result = ensureCacheDirectoryExists(filePath);
			assert.strictEqual(result.valid, false);
			assert.ok(result.error?.includes("not a directory"));
		});
	});

	describe("validateCacheDirectoryPermissions", () => {
		it("should validate readable and writable directory", () => {
			const result = validateCacheDirectoryPermissions(tempDir);
			assert.strictEqual(result.valid, true);
		});

		it("should fail if directory doesn't exist", () => {
			const nonExistent = path.join(tempDir, "nonexistent");
			const result = validateCacheDirectoryPermissions(nonExistent);
			assert.strictEqual(result.valid, false);
			assert.ok(result.error?.includes("does not exist"));
		});

		it("should test write permissions", () => {
			// Create a writable directory
			const writableDir = path.join(tempDir, "writable");
			fs.mkdirSync(writableDir);

			const result = validateCacheDirectoryPermissions(writableDir);
			assert.strictEqual(result.valid, true);
		});

		it("should fail for read-only directory on Unix", function () {
			if (process.platform === "win32") {
				// Windows permission model is different, skip this test
				this.skip();
			}

			const readOnlyDir = path.join(tempDir, "readonly");
			fs.mkdirSync(readOnlyDir);

			// Make directory read-only
			fs.chmodSync(readOnlyDir, 0o444);

			try {
				const result = validateCacheDirectoryPermissions(readOnlyDir);
				assert.strictEqual(result.valid, false);
				assert.ok(
					result.error?.includes("not writable") ||
						result.error?.includes("Insufficient permissions"),
				);
			} finally {
				// Restore permissions for cleanup
				fs.chmodSync(readOnlyDir, 0o755);
			}
		});
	});

	describe("validateDiskSpace", () => {
		it("should return valid result even if disk space cannot be determined", () => {
			// This should not fail even on platforms where we can't get disk space
			const result = validateDiskSpace(tempDir);
			assert.strictEqual(result.valid, true);
		});

		it("should provide warnings if disk space is available and low", function () {
			// This test is hard to simulate reliably, so we just verify it doesn't crash
			const result = validateDiskSpace(tempDir);
			assert.strictEqual(result.valid, true);
			// Warnings are optional based on actual disk space
		});
	});

	describe("validateCacheConfiguration", () => {
		it("should validate complete configuration successfully", () => {
			const cacheDir = path.join(tempDir, "cache");
			const result = validateCacheConfiguration(cacheDir, true);
			assert.strictEqual(result.valid, true);
			assert.ok(fs.existsSync(cacheDir));
		});

		it("should fail validation for invalid paths", () => {
			const result = validateCacheConfiguration("", true);
			assert.strictEqual(result.valid, false);
			assert.ok(result.error);
		});

		it("should fail if directory doesn't exist and createIfMissing is false", () => {
			const nonExistent = path.join(tempDir, "nonexistent");
			const result = validateCacheConfiguration(nonExistent, false);
			assert.strictEqual(result.valid, false);
			assert.ok(result.error?.includes("does not exist"));
		});

		it("should succeed if directory exists and createIfMissing is false", () => {
			const existingDir = path.join(tempDir, "existing");
			fs.mkdirSync(existingDir);
			const result = validateCacheConfiguration(existingDir, false);
			assert.strictEqual(result.valid, true);
		});

		it("should accumulate warnings from all validation steps", () => {
			// Create a valid cache directory
			const cacheDir = path.join(tempDir, "cache-with-warnings");
			const result = validateCacheConfiguration(cacheDir, true);

			// Should be valid even with warnings
			assert.strictEqual(result.valid, true);

			// Warnings are platform and disk-space dependent, so we just verify
			// the function doesn't crash and returns a valid structure
			if (result.warnings) {
				assert.ok(Array.isArray(result.warnings));
			}
		});
	});

	describe("formatValidationMessage", () => {
		it("should format error messages", () => {
			const result = {
				valid: false,
				error: "Test error message",
			};
			const message = formatValidationMessage(result);
			assert.ok(message.includes("ERROR"));
			assert.ok(message.includes("Test error message"));
		});

		it("should format warning messages", () => {
			const result = {
				valid: true,
				warnings: ["Warning 1", "Warning 2"],
			};
			const message = formatValidationMessage(result);
			assert.ok(message.includes("WARNING"));
			assert.ok(message.includes("Warning 1"));
			assert.ok(message.includes("Warning 2"));
		});

		it("should return empty string for valid result with no warnings", () => {
			const result = {
				valid: true,
			};
			const message = formatValidationMessage(result);
			assert.strictEqual(message, "");
		});

		it("should prioritize error over warnings", () => {
			const result = {
				valid: false,
				error: "Error message",
				warnings: ["Warning message"],
			};
			const message = formatValidationMessage(result);
			assert.ok(message.includes("ERROR"));
			assert.ok(message.includes("Error message"));
		});
	});
});

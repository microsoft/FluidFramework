/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
	FileSystemSnapshotStrategy,
	GlobPatternStrategy,
	HybridDetectionStrategy,
	createOutputDetectionStrategy,
} from "../../fluidBuild/sharedCache/outputDetection.js";

describe("Output Detection Strategies", () => {
	let tempDir: string;

	beforeEach(async () => {
		// Create a temporary directory for tests
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "output-detection-test-"));
	});

	afterEach(async () => {
		// Clean up temporary directory
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	describe("FileSystemSnapshotStrategy", () => {
		it("should detect newly created files", async () => {
			const strategy = new FileSystemSnapshotStrategy(tempDir);

			// Capture before state
			await strategy.beforeExecution();

			// Create new files
			await fs.writeFile(path.join(tempDir, "new-file.txt"), "content");
			await fs.mkdir(path.join(tempDir, "subdir"), { recursive: true });
			await fs.writeFile(path.join(tempDir, "subdir", "nested.txt"), "nested content");

			// Capture after state
			await strategy.afterExecution();

			// Get new files
			const newFiles = strategy.getNewFiles();

			assert.equal(newFiles.length, 2, "Should detect 2 new files");
			assert.ok(
				newFiles.some((f) => f.endsWith("new-file.txt")),
				"Should include new-file.txt",
			);
			assert.ok(
				newFiles.some((f) => f.endsWith("nested.txt")),
				"Should include nested.txt",
			);
		});

		it("should detect modified files", async () => {
			const filePath = path.join(tempDir, "existing-file.txt");

			// Create file before snapshot
			await fs.writeFile(filePath, "initial content");
			// Wait a bit to ensure different mtime
			await new Promise((resolve) => setTimeout(resolve, 10));

			const strategy = new FileSystemSnapshotStrategy(tempDir);

			// Capture before state
			await strategy.beforeExecution();

			// Wait to ensure mtime will be different
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Modify file
			await fs.writeFile(filePath, "modified content");

			// Capture after state
			await strategy.afterExecution();

			// Get modified files
			const newFiles = strategy.getNewFiles();

			assert.equal(newFiles.length, 1, "Should detect 1 modified file");
			assert.ok(newFiles[0].endsWith("existing-file.txt"), "Should include existing-file.txt");
		});

		it("should exclude patterns", async () => {
			const strategy = new FileSystemSnapshotStrategy(tempDir, ["**/excluded/**"]);

			// Capture before state
			await strategy.beforeExecution();

			// Create files in excluded directory
			await fs.mkdir(path.join(tempDir, "excluded"), { recursive: true });
			await fs.writeFile(path.join(tempDir, "excluded", "ignored.txt"), "ignored");

			// Create files in normal directory
			await fs.mkdir(path.join(tempDir, "included"), { recursive: true });
			await fs.writeFile(path.join(tempDir, "included", "detected.txt"), "detected");

			// Capture after state
			await strategy.afterExecution();

			// Get new files
			const newFiles = strategy.getNewFiles();

			assert.equal(newFiles.length, 1, "Should detect only 1 file");
			assert.ok(
				newFiles[0].endsWith("detected.txt"),
				"Should include detected.txt from included dir",
			);
			assert.ok(
				!newFiles.some((f) => f.includes("ignored.txt")),
				"Should not include ignored.txt from excluded dir",
			);
		});

		it("should handle empty directory", async () => {
			const strategy = new FileSystemSnapshotStrategy(tempDir);

			await strategy.beforeExecution();
			await strategy.afterExecution();

			const newFiles = strategy.getNewFiles();

			assert.equal(newFiles.length, 0, "Should detect no files in empty directory");
		});
	});

	describe("GlobPatternStrategy", () => {
		it("should match files using glob patterns", async () => {
			const strategy = new GlobPatternStrategy(tempDir, ["**/*.js", "**/*.ts"]);

			// Create test files
			await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
			await fs.writeFile(path.join(tempDir, "src", "index.js"), "js content");
			await fs.writeFile(path.join(tempDir, "src", "types.ts"), "ts content");
			await fs.writeFile(path.join(tempDir, "readme.md"), "markdown");

			// Capture before and after
			await strategy.beforeExecution();
			await strategy.afterExecution();

			const matchedFiles = strategy.getNewFiles();

			assert.equal(matchedFiles.length, 2, "Should match 2 files");
			assert.ok(
				matchedFiles.some((f) => f.endsWith("index.js")),
				"Should include index.js",
			);
			assert.ok(
				matchedFiles.some((f) => f.endsWith("types.ts")),
				"Should include types.ts",
			);
			assert.ok(
				!matchedFiles.some((f) => f.endsWith("readme.md")),
				"Should not include readme.md",
			);
		});

		it("should match nested patterns", async () => {
			const strategy = new GlobPatternStrategy(tempDir, ["dist/**/*.js"]);

			// Create nested structure
			await fs.mkdir(path.join(tempDir, "dist", "lib"), { recursive: true });
			await fs.writeFile(path.join(tempDir, "dist", "lib", "module.js"), "js content");
			await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
			await fs.writeFile(path.join(tempDir, "src", "source.js"), "source");

			await strategy.beforeExecution();
			await strategy.afterExecution();

			const matchedFiles = strategy.getNewFiles();

			assert.equal(matchedFiles.length, 1, "Should match 1 file");
			assert.ok(matchedFiles[0].includes("dist"), "Should include file from dist/");
		});

		it("should handle no matches", async () => {
			const strategy = new GlobPatternStrategy(tempDir, ["**/*.nonexistent"]);

			await fs.writeFile(path.join(tempDir, "file.txt"), "content");

			await strategy.beforeExecution();
			await strategy.afterExecution();

			const matchedFiles = strategy.getNewFiles();

			assert.equal(matchedFiles.length, 0, "Should match no files");
		});
	});

	describe("HybridDetectionStrategy", () => {
		it("should detect new files within pattern scope", async () => {
			const strategy = new HybridDetectionStrategy(tempDir, ["dist/**"]);

			// Capture before state
			await strategy.beforeExecution();

			// Create files in dist/
			await fs.mkdir(path.join(tempDir, "dist"), { recursive: true });
			await fs.writeFile(path.join(tempDir, "dist", "output.js"), "output");

			// Create files outside pattern
			await fs.writeFile(path.join(tempDir, "other.txt"), "other");

			// Capture after state
			await strategy.afterExecution();

			const newFiles = strategy.getNewFiles();

			assert.ok(newFiles.length > 0, "Should detect files in dist/");
			assert.ok(
				newFiles.some((f) => f.includes("dist")),
				"Should include files from dist/",
			);
			assert.ok(
				!newFiles.some((f) => f.endsWith("other.txt")),
				"Should not include files outside pattern",
			);
		});
	});

	describe("createOutputDetectionStrategy", () => {
		it("should create GlobPatternStrategy when outputGlobs provided", () => {
			const strategy = createOutputDetectionStrategy("custom", tempDir, ["dist/**/*.js"]);

			assert.ok(strategy instanceof GlobPatternStrategy, "Should create GlobPatternStrategy");
		});

		it("should create HybridDetectionStrategy for tsc tasks", () => {
			const strategy = createOutputDetectionStrategy("tsc", tempDir);

			assert.ok(
				strategy instanceof HybridDetectionStrategy,
				"Should create HybridDetectionStrategy for tsc",
			);
		});

		it("should create GlobPatternStrategy for eslint tasks", () => {
			const strategy = createOutputDetectionStrategy("eslint", tempDir);

			assert.ok(
				strategy instanceof GlobPatternStrategy,
				"Should create GlobPatternStrategy for eslint",
			);
		});

		it("should create HybridDetectionStrategy for webpack tasks", () => {
			const strategy = createOutputDetectionStrategy("webpack", tempDir);

			assert.ok(
				strategy instanceof HybridDetectionStrategy,
				"Should create HybridDetectionStrategy for webpack",
			);
		});

		it("should create FileSystemSnapshotStrategy for unknown tasks", () => {
			const strategy = createOutputDetectionStrategy("unknown-task", tempDir);

			assert.ok(
				strategy instanceof FileSystemSnapshotStrategy,
				"Should create FileSystemSnapshotStrategy for unknown tasks",
			);
		});
	});
});

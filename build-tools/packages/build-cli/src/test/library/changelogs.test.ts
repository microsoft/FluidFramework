/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions */

import { strict as assert } from "node:assert";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IPackage } from "@fluid-tools/build-infrastructure";
import { afterEach, beforeEach, describe, it } from "mocha";
import { updateChangelogs } from "../../library/changelogs.js";

describe("changelogs", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await mkdtemp(path.join(tmpdir(), "changelog-test-"));
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	describe("updateChangelogs", () => {
		it("should skip changelog updates for release group root packages", async () => {
			const pkg: IPackage = {
				directory: testDir,
				version: "1.0.0",
				isReleaseGroupRoot: true,
				isWorkspaceRoot: false,
			} as IPackage;

			await updateChangelogs(pkg, "minor");

			// Verify no CHANGELOG.md was created
			await assert.rejects(async () => access(path.join(testDir, "CHANGELOG.md")), /ENOENT/);
		});

		it("should skip changelog updates for workspace root packages", async () => {
			const pkg = {
				directory: testDir,
				version: "1.0.0",
				isReleaseGroupRoot: false,
				isWorkspaceRoot: true,
			} as IPackage;

			await updateChangelogs(pkg, "minor");

			// Verify no CHANGELOG.md was created
			await assert.rejects(async () => access(path.join(testDir, "CHANGELOG.md")), /ENOENT/);
		});

		it("should use version override when provided", async () => {
			const changelogPath = path.join(testDir, "CHANGELOG.md");
			await writeFile(
				changelogPath,
				"# Changelog\n\n## 1.1.0\n\nSome changes\n\n## 1.0.0\n\nInitial release\n",
			);

			const pkg = {
				directory: testDir,
				version: "1.0.0",
				isReleaseGroupRoot: false,
				isWorkspaceRoot: false,
			} as IPackage;

			await updateChangelogs(pkg, "minor", "2.5.0");

			const content = await readFile(changelogPath, "utf8");
			assert.match(content, /## 2\.5\.0\n/);
			assert.doesNotMatch(content, /## 1\.1\.0\n/);
		});

		it("should use package version when no override provided", async () => {
			const changelogPath = path.join(testDir, "CHANGELOG.md");
			await writeFile(
				changelogPath,
				"# Changelog\n\n## 1.1.0\n\nSome changes\n\n## 1.0.0\n\nInitial release\n",
			);

			const pkg = {
				directory: testDir,
				version: "1.0.0",
				isReleaseGroupRoot: false,
				isWorkspaceRoot: false,
			} as IPackage;

			await updateChangelogs(pkg, "minor");

			const content = await readFile(changelogPath, "utf8");
			assert.match(content, /## 1\.0\.0\n/);
			assert.doesNotMatch(content, /## 1\.1\.0\n/);
		});

		it("should handle version strings with special regex characters (dots)", async () => {
			const changelogPath = path.join(testDir, "CHANGELOG.md");
			await writeFile(
				changelogPath,
				"# Changelog\n\n## 1.1.0\n\nSome changes\n\n## 1.0.0\n\nInitial release\n",
			);

			const pkg = {
				directory: testDir,
				version: "1.0.0",
				isReleaseGroupRoot: false,
				isWorkspaceRoot: false,
			} as IPackage;

			await updateChangelogs(pkg, "minor");

			const content = await readFile(changelogPath, "utf8");
			// Should replace "1.1.0" not "1x1x0" (dots should be literal)
			assert.match(content, /## 1\.0\.0\n/);
		});

		it("should handle version strings with hyphens", async () => {
			const changelogPath = path.join(testDir, "CHANGELOG.md");
			await writeFile(
				changelogPath,
				"# Changelog\n\n## 1.0.0\n\nSome changes\n\n## 0.9.0\n\nInitial release\n",
			);

			const pkg = {
				directory: testDir,
				version: "1.0.0-rc.0",
				isReleaseGroupRoot: false,
				isWorkspaceRoot: false,
			} as IPackage;

			await updateChangelogs(pkg, "major", "1.0.0-rc.0");

			const content = await readFile(changelogPath, "utf8");
			assert.match(content, /## 1\.0\.0-rc\.0\n/);
			assert.doesNotMatch(content, /## 1\.0\.0\n/);
		});

		it("should handle version strings with plus signs", async () => {
			const changelogPath = path.join(testDir, "CHANGELOG.md");
			await writeFile(
				changelogPath,
				"# Changelog\n\n## 1.1.0\n\nSome changes\n\n## 1.0.0\n\nInitial release\n",
			);

			const pkg = {
				directory: testDir,
				version: "1.0.0+build.1",
				isReleaseGroupRoot: false,
				isWorkspaceRoot: false,
			} as IPackage;

			await updateChangelogs(pkg, "minor", "1.0.0+build.1");

			const content = await readFile(changelogPath, "utf8");
			assert.match(content, /## 1\.0\.0\+build\.1\n/);
		});

		it("should support internal version scheme packages", async () => {
			const changelogPath = path.join(testDir, "CHANGELOG.md");
			await writeFile(
				changelogPath,
				"# Changelog\n\n## 2.0.0-internal.2.0.0\n\nSome changes\n\n## 2.0.0-internal.1.0.0\n\nInitial release\n",
			);

			const pkg = {
				directory: testDir,
				version: "2.0.0-internal.1.0.0",
				isReleaseGroupRoot: false,
				isWorkspaceRoot: false,
			} as IPackage;

			await updateChangelogs(pkg, "minor");

			const content = await readFile(changelogPath, "utf8");
			assert.match(content, /## 2\.0\.0-internal\.1\.0\.0\n/);
		});

		it("should bump major version correctly for standard semver", async () => {
			const changelogPath = path.join(testDir, "CHANGELOG.md");
			await writeFile(
				changelogPath,
				"# Changelog\n\n## 2.0.0\n\nMajor changes\n\n## 1.0.0\n\nInitial release\n",
			);

			const pkg = {
				directory: testDir,
				version: "1.0.0",
				isReleaseGroupRoot: false,
				isWorkspaceRoot: false,
			} as IPackage;

			await updateChangelogs(pkg, "major");

			const content = await readFile(changelogPath, "utf8");
			assert.match(content, /## 1\.0\.0\n/);
			assert.doesNotMatch(content, /## 2\.0\.0\n/);
		});

		it("should bump minor version correctly for standard semver", async () => {
			const changelogPath = path.join(testDir, "CHANGELOG.md");
			await writeFile(
				changelogPath,
				"# Changelog\n\n## 1.1.0\n\nMinor changes\n\n## 1.0.0\n\nInitial release\n",
			);

			const pkg = {
				directory: testDir,
				version: "1.0.0",
				isReleaseGroupRoot: false,
				isWorkspaceRoot: false,
			} as IPackage;

			await updateChangelogs(pkg, "minor");

			const content = await readFile(changelogPath, "utf8");
			assert.match(content, /## 1\.0\.0\n/);
			assert.doesNotMatch(content, /## 1\.1\.0\n/);
		});

		it("should bump patch version correctly for standard semver", async () => {
			const changelogPath = path.join(testDir, "CHANGELOG.md");
			await writeFile(
				changelogPath,
				"# Changelog\n\n## 1.0.1\n\nPatch changes\n\n## 1.0.0\n\nInitial release\n",
			);

			const pkg = {
				directory: testDir,
				version: "1.0.0",
				isReleaseGroupRoot: false,
				isWorkspaceRoot: false,
			} as IPackage;

			await updateChangelogs(pkg, "patch");

			const content = await readFile(changelogPath, "utf8");
			assert.match(content, /## 1\.0\.0\n/);
			assert.doesNotMatch(content, /## 1\.0\.1\n/);
		});

		it("should add 'Dependency updates only' section for packages with no direct changes", async () => {
			const changelogPath = path.join(testDir, "CHANGELOG.md");
			await writeFile(
				changelogPath,
				"# Changelog\n\n## 1.0.1\n\n## 1.0.0\n\nInitial release\n",
			);

			const pkg = {
				directory: testDir,
				version: "1.0.0",
				isReleaseGroupRoot: false,
				isWorkspaceRoot: false,
			} as IPackage;

			await updateChangelogs(pkg, "patch");

			const content = await readFile(changelogPath, "utf8");
			assert.match(content, /## 1\.0\.0\n\nDependency updates only\.\n/);
		});

		it("should not add 'Dependency updates only' if there are already changes", async () => {
			const changelogPath = path.join(testDir, "CHANGELOG.md");
			await writeFile(
				changelogPath,
				"# Changelog\n\n## 1.0.1\n\nActual changes here\n\n## 1.0.0\n\nInitial release\n",
			);

			const pkg = {
				directory: testDir,
				version: "1.0.0",
				isReleaseGroupRoot: false,
				isWorkspaceRoot: false,
			} as IPackage;

			await updateChangelogs(pkg, "patch");

			const content = await readFile(changelogPath, "utf8");
			assert.match(content, /## 1\.0\.0\n\nActual changes here\n/);
			assert.doesNotMatch(content, /Dependency updates only/);
		});

		it("should throw error when CHANGELOG.md file does not exist", async () => {
			const pkg = {
				directory: testDir,
				version: "1.0.0",
				isReleaseGroupRoot: false,
				isWorkspaceRoot: false,
			} as IPackage;

			await assert.rejects(async () => updateChangelogs(pkg, "minor"), /Failed to replace/);
		});

		it("should replace all occurrences of version string (global replace)", async () => {
			const changelogPath = path.join(testDir, "CHANGELOG.md");
			await writeFile(
				changelogPath,
				"# Changelog\n\n## 1.1.0\n\nChanges in 1.1.0 release\n\n## 1.0.0\n\nInitial release\n",
			);

			const pkg = {
				directory: testDir,
				version: "1.0.0",
				isReleaseGroupRoot: false,
				isWorkspaceRoot: false,
			} as IPackage;

			await updateChangelogs(pkg, "minor");

			const content = await readFile(changelogPath, "utf8");
			// Both occurrences of "1.1.0" should be replaced with "1.0.0"
			const matches = content.match(/1\.0\.0/g) ?? [];
			assert.ok(matches.length >= 2, "Should replace all occurrences");
		});

		it("should handle version strings with parentheses and brackets", async () => {
			const changelogPath = path.join(testDir, "CHANGELOG.md");
			await writeFile(
				changelogPath,
				"# Changelog\n\n## 1.1.0\n\nSome changes\n\n## 1.0.0\n\nInitial release\n",
			);

			const pkg = {
				directory: testDir,
				version: "1.0.0",
				isReleaseGroupRoot: false,
				isWorkspaceRoot: false,
			} as IPackage;

			// This tests that the escapeRegex function properly handles all special characters
			await updateChangelogs(pkg, "minor");

			const content = await readFile(changelogPath, "utf8");
			assert.match(content, /## 1\.0\.0\n/);
		});

		it("should include file path in error message when file operations fail", async () => {
			const pkg = {
				directory: "/nonexistent/path",
				version: "1.0.0",
				isReleaseGroupRoot: false,
				isWorkspaceRoot: false,
			} as IPackage;

			try {
				await updateChangelogs(pkg, "minor");
				assert.fail("Should have thrown an error");
			} catch (error) {
				assert.ok(error instanceof Error);
				assert.match(error.message, /\/nonexistent\/path/);
				assert.match(error.message, /Failed to replace/);
			}
		});
	});
});

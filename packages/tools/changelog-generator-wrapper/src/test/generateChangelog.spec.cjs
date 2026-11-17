/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { mkdir, mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { afterEach, beforeEach, describe, it } = require("mocha");

const execFileAsync = promisify(execFile);

describe("changelog generation", () => {
	let testDir;

	// "changeset version" consumes its input and updates package files, so give each case a fresh repository.
	beforeEach(async () => {
		testDir = await mkdtemp(path.join(tmpdir(), "fluid-changelog-generation-"));
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true });
	});

	/**
	 * Generates a complete changelog and compares it with a checked-in Markdown snapshot.
	 *
	 * @param {string} snapshotFileName - The snapshot file name within this suite's fixtures directory.
	 * @param {Record<string, string>} changesets - Changeset contents keyed by file name without the extension.
	 * @returns {Promise<void>} Resolves when the generated document matches its snapshot.
	 */
	async function generateAndAssertSnapshot(snapshotFileName, changesets) {
		await mkdir(path.join(testDir, ".changeset"));
		await writeFile(
			path.join(testDir, "package.json"),
			JSON.stringify({ name: "example-package", version: "1.0.0" }),
		);

		// Resolve this workspace's wrapper explicitly so the test cannot silently use the default list formatter.
		await writeFile(
			path.join(testDir, ".changeset", "config.json"),
			JSON.stringify({
				changelog: [
					require.resolve("../index.js"),
					{
						repoBaseUrl: "https://example.com/repo",
						issueTemplate: " ([#$issue]($repoBaseUrl/pull/$issue))",
						commitTemplate: " [$abbrevHash]($repoBaseUrl/commit/$hash)",
						gitlogOptions: { repo: testDir },
					},
				],
				commit: false,
				fixed: [],
				linked: [],
				access: "public",
				baseBranch: "main",
				updateInternalDependencies: "patch",
				ignore: [],
			}),
		);
		await Promise.all(
			Object.entries(changesets).map(([name, content]) =>
				writeFile(path.join(testDir, ".changeset", `${name}.md`), content),
			),
		);
		await execFileAsync("git", ["init", "--initial-branch=main", testDir]);
		await execFileAsync("git", ["add", "."], { cwd: testDir });

		// The squash-commit-style suffix exercises automatic PR link extraction.
		await execFileAsync(
			"git",
			[
				"-c",
				"user.name=Test",
				"-c",
				"user.email=test@example.com",
				"-c",
				"commit.gpgsign=false",
				"commit",
				"-m",
				"Improve items (#42)",
			],
			{ cwd: testDir },
		);
		await execFileAsync(
			process.execPath,
			[require.resolve("@changesets/cli/bin.js"), "version"],
			{ cwd: testDir },
		);
		const { stdout } = await execFileAsync("git", ["show", "-s", "--format=%H%n%h", "HEAD"], {
			cwd: testDir,
		});
		const [hash, abbreviatedHash] = stdout.trim().split("\n");

		// Compare the entire emitted document, substituting only the commit hashes that vary between fixture runs.
		const actual = await readFile(path.join(testDir, "CHANGELOG.md"), "utf8");
		const snapshot = await readFile(
			path.join(__dirname, "fixtures", snapshotFileName),
			"utf8",
		);
		const expected = snapshot
			.replaceAll("<COMMIT_HASH>", hash)
			.replaceAll("<SHORT_COMMIT_HASH>", abbreviatedHash);
		assert.equal(actual, expected);
	}

	// Establish the package/version/category structure and navigation links without body headings to normalize.
	it("generates a complete changelog for a simple changeset", async () => {
		const simple = `---
"example-package": patch
---
Improve item loading

Items now load without unnecessary retries.
`;
		await generateAndAssertSnapshot("changelog.baseline.md", {
			simple,
		});
	});

	it("generates sibling entry headings through the Changesets CLI", async () => {
		const example = `---
"example-package": minor
---
Improve memory usage

Details.

# Example measurements

Measurements.

###### Details
    const value = 1;
`;

		const second = `---
"example-package": minor
---
Manage branches independently

Branch details.
`;

		await generateAndAssertSnapshot("changelog.normalized-headings.md", {
			example,
			second,
		});
	});
});

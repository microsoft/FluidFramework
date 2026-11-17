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

/**
 * Use `pnpm run test:update-snapshots` to regenerate the checked-in snapshots.
 */
const regenerateSnapshots = process.argv.includes("--snapshot");

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
	 * Generates a complete changelog and compares it with a checked-in Markdown snapshot, or updates it in regeneration mode.
	 *
	 * @param {string} snapshotFileName - The snapshot file name within this suite's fixtures directory.
	 * @param {Record<string, string>} changesets - Changeset contents keyed by file name without the extension.
	 * @returns {Promise<void>} Resolves when the snapshot has been checked or regenerated.
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

		// Replace full hashes before their abbreviated forms so regenerated snapshots retain stable placeholders.
		const output = await readFile(path.join(testDir, "CHANGELOG.md"), "utf8");
		const actual = output
			.replaceAll(hash, "<COMMIT_HASH>")
			.replaceAll(abbreviatedHash, "<SHORT_COMMIT_HASH>");
		const snapshotPath = path.join(__dirname, "fixtures", snapshotFileName);
		if (regenerateSnapshots) {
			await writeFile(snapshotPath, actual);
		} else {
			const expected = await readFile(snapshotPath, "utf8");
			assert.equal(actual, expected);
		}
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

> \`x
> y\`
> ===

### https://example.com/a_b

> <a
> href="https://example.com">Hello</a>
> ===
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

	// HTML blocks need a blank line before the following entry, even when their tags are already closed.
	it("keeps the next entry separate after a trailing HTML block", async () => {
		const first = `---
"example-package": minor
---
HTML notice

<div>Notice</div>
`;
		const second = `---
"example-package": minor
---
Next change

Visible details.
`;
		await generateAndAssertSnapshot("changelog.html-boundary.md", { first, second });
	});

	// A blank separator alone cannot terminate a raw HTML block such as <pre>.
	it("keeps the next entry's heading and formatting outside EOF-open raw HTML", async () => {
		const first = `---
"example-package": minor
---
Raw HTML example

<pre>
`;
		const second = `---
"example-package": minor
---
Next change

**Important** details.
`;
		await generateAndAssertSnapshot("changelog.raw-html-boundary.md", { first, second });
	});

	// An open fence is valid at a standalone document's EOF, but must be closed before another changeset is appended.
	it("keeps the next entry outside an EOF-terminated code fence", async () => {
		const first = `---
"example-package": minor
---
Code example

\`\`\`js
example();
`;
		const second = `---
"example-package": minor
---
Next change

Visible details.
`;
		await generateAndAssertSnapshot("changelog.fence-boundary.md", { first, second });
	});
});

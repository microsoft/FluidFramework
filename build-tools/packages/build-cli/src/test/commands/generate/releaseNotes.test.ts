/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import execa from "execa";
import { afterEach, beforeEach, describe, it } from "mocha";

describe("generate:releaseNotes", () => {
	let testDir: string;

	// Provide a minimal release group, workspace, and configuration for normal CLI discovery.
	// A temporary repository keeps checked-in changesets and release notes untouched.
	beforeEach(async () => {
		testDir = await mkdtemp(path.join(tmpdir(), "fluid-release-note-headings-"));
		await mkdir(path.join(testDir, ".changeset"));
		await mkdir(path.join(testDir, "packages", "example"), { recursive: true });
		await writeFile(
			path.join(testDir, "package.json"),
			JSON.stringify({
				name: "release-note-test-root",
				version: "1.0.0",
				private: true,

				// The Markdown pipeline requires repository metadata even when the changesets contain no GitHub references.
				repository: {
					type: "git",
					url: "https://github.com/example/repo.git",
				},
				fluidBuild: {
					version: 1,
					repoPackages: { client: { directory: "." } },
				},
			}),
		);

		// Match the changesets' section metadata; entries in unknown sections are omitted by default.
		await writeFile(
			path.join(testDir, "flub.config.cjs"),
			'module.exports = { version: 1, releaseNotes: { sections: { other: { heading: "Other changes" } } } };\n',
		);
		await writeFile(
			path.join(testDir, "packages", "example", "package.json"),
			JSON.stringify({ name: "example-package", version: "1.0.0" }),
		);
		await writeFile(path.join(testDir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
		await execa("git", ["init", "--initial-branch=main"], { cwd: testDir });
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true });
	});

	// Source levels 1 and 2 must become levels 4 and 5, beneath the generated level-3 change title.
	// Skipping to source level 4 deliberately maps "Deep details" to level 7, exercising the bold-label fallback.
	it("normalizes each body before adding generated titles and change details", async () => {
		const firstChangeset = [
			"---",
			'"example-package": minor',
			'"__section": other',
			"---",
			"Improve memory usage",
			"",
			"# Examples",
			"",
			"## Measurements",
			"",
			"#### Deep details",
			"",
			"```markdown",
			"# A code example",
			"```",
			"",
		].join("\n");
		await writeFile(path.join(testDir, ".changeset", "first.md"), firstChangeset);

		// Authors can choose heading levels independently for each changeset.
		// This level-6 heading must become level 4, not inherit the first body's offset and become a bold label.
		await writeFile(
			path.join(testDir, ".changeset", "second.md"),
			'---\n"example-package": minor\n"__section": other\n---\nNext change\n\n###### Another top-level heading\n\nDetails.\n',
		);

		// Changeset loading inspects Git history for commit metadata, so provide committed source files.
		await execa("git", ["add", "."], { cwd: testDir });
		await execa(
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
				"Add release-note fixtures",
			],
			{ cwd: testDir },
		);

		// Keep both CLI repository discovery and cwd-relative Markdown metadata lookup inside the fixture.
		await execa(
			process.execPath,
			[
				path.resolve(import.meta.dirname, "../../../../bin/run.js"),
				"generate:releaseNotes",
				"-g",
				"client",
				"-t",
				"minor",
				"--outFile",
				"release-notes.md",
				"--quiet",
			],
			{ cwd: testDir, env: { _FLUID_ROOT_: testDir } },
		);

		const output = await readFile(path.join(testDir, "release-notes.md"), "utf8");

		// Readers should see sibling level-3 change titles, with body headings nested at levels 4 and 5.
		// Generated "Change details" must remain level 4 and must not influence the per-body normalization offset.
		for (const { title, expected } of [
			{
				title: "### Improve memory usage",
				expected: `### Improve memory usage

#### Examples

##### Measurements

**Deep details**

\`\`\`markdown
# A code example
\`\`\`

`,
			},
			{
				title: "### Next change",
				expected: `### Next change

#### Another top-level heading

Details.

`,
			},
		]) {
			// Compare complete emitted bodies while excluding variable commit metadata and the generated table of contents.
			// Include line boundaries in both markers so a heading at the wrong depth cannot match a suffix of a deeper one.
			const start = output.indexOf(`\n${title}\n`);
			assert.notEqual(start, -1, `Expected a standalone "${title}" heading.`);
			const end = output.indexOf("\n#### Change details\n", start + 1);
			assert.ok(end > start, `Expected level-4 change details after "${title}".`);
			const actual = output.slice(start + 1, end + 1);
			assert.equal(actual, expected);
		}

		// Normalization is output-only, preserving the author's source for generators with different target heading depths.
		const actual = await readFile(path.join(testDir, ".changeset", "first.md"), "utf8");
		const expected = firstChangeset;
		assert.equal(actual, expected);
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { cp, mkdir, mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { after, before, describe, it } = require("mocha");

const { getReleaseLine } = require("../getReleaseLine.js");
const { getDependencyReleaseLine } = require("../getDependencyReleaseLine.js");

const execFileAsync = promisify(execFile);

/**
 * Link templates shaped like the production configuration but pointing to a fixture repository.
 */
const linkOptions = {
	repoBaseUrl: "https://example.com/repo",
	issueTemplate: " ([#$issue]($repoBaseUrl/pull/$issue))",
	commitTemplate: " [$abbrevHash]($repoBaseUrl/commit/$hash)",
};

// Most cases compare a single entry's Markdown; the final case checks the assembled changelog through the real Changesets CLI.
// This covers both author-visible formatting and the document hierarchy readers navigate.
describe("changelog formatter", () => {
	let testDir;
	let repoDir;

	// The upstream formatter looks up changeset files in Git even when Markdown is supplied directly.
	// Committed fixtures in a temporary repository exercise that behavior without touching the checkout.
	before(async () => {
		testDir = await mkdtemp(path.join(tmpdir(), "fluid-changelog-"));
		repoDir = path.join(testDir, "repo");
		await mkdir(path.join(repoDir, ".changeset"), { recursive: true });
		await writeFile(
			path.join(repoDir, "package.json"),
			JSON.stringify({ name: "example-package", version: "1.0.0" }),
		);

		// Resolve this workspace's wrapper explicitly so the integration test cannot silently use the default list formatter.
		await writeFile(
			path.join(repoDir, ".changeset", "config.json"),
			JSON.stringify({
				changelog: [
					require.resolve("../index.js"),
					{ ...linkOptions, gitlogOptions: { repo: repoDir } },
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
		await writeFile(
			path.join(repoDir, ".changeset", "example.md"),
			'---\n"example-package": minor\n---\nImprove memory usage\n\nDetails.\n\n# Example measurements\n\nMeasurements.\n',
		);
		await writeFile(
			path.join(repoDir, ".changeset", "second.md"),
			'---\n"example-package": minor\n---\nManage branches independently\n\nBranch details.\n',
		);
		await execFileAsync("git", ["init", "--initial-branch=main", repoDir]);
		await execFileAsync("git", ["add", "."], { cwd: repoDir });

		// The squash-commit-style suffix exercises automatic PR link extraction.
		// The generated commit hash is checked dynamically rather than depending on a fixed test timestamp.
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
			{ cwd: repoDir },
		);
	});

	after(async () => {
		if (testDir !== undefined) {
			await rm(testDir, { recursive: true });
		}
	});

	/* eslint-disable tsdoc/syntax -- JavaScript type annotations use JSDoc syntax. */

	/**
	 * Formats Markdown without commit or PR links so the content can be compared directly.
	 *
	 * @remarks
	 * Reuse a committed changeset ID to exercise normal Git lookup while suppressing variable link text in content assertions.
	 *
	 * @param {string} summary - The complete changeset Markdown, excluding front matter.
	 * @returns {Promise<string>} The formatted changelog entry.
	 */
	/* eslint-enable tsdoc/syntax */
	async function format(summary) {
		return getReleaseLine(
			{ id: "example", summary, releases: [{ name: "example-package", type: "minor" }] },
			"minor",
			{
				commitTemplate: "",
				issueTemplate: "",
				gitlogOptions: { repo: repoDir },
			},
		);
	}

	// Each entry needs its own section so its body headings cannot appear to contain subsequent changes.
	it("formats the summary as a heading instead of a list item", async () => {
		assert.equal(await format("Improve items"), "#### Improve items");
	});

	// Level-4 entry titles leave only levels 5 and 6 for body headings; deeper sections must remain readable as bold labels.
	it("preserves relative nesting and renders adjusted levels above 6 as bold labels", async () => {
		assert.equal(
			await format(
				"Improve items\n\nDetails.\n\n#### Examples\n\nExample.\n\n##### Measurements\n\nNumbers.\n\n###### Details\n\nMore details.",
			),
			"#### Improve items\n\nDetails.\n\n##### Examples\n\nExample.\n\n###### Measurements\n\nNumbers.\n\n**Details**\n\nMore details.",
		);
	});

	// Source depth is an authoring choice, not a restriction.
	// Even a lone level-6 heading becomes level 5 rather than a bold label because it is the shallowest heading in its body.
	for (const depth of [1, 2, 3, 4, 5, 6]) {
		it(`normalizes a level-${depth} body heading to level 5`, async () => {
			assert.equal(
				await format(`Improve items\n\n${"#".repeat(depth)} Examples`),
				"#### Improve items\n\n##### Examples",
			);
		});
	}

	// Preserve the author's numeric level gaps: source levels 2, 4, and 6 map to 5, 7, and 9, not consecutive output headings.
	it("preserves gaps between source heading levels", async () => {
		assert.equal(
			await format("Improve items\n\n## Examples\n\n#### Details\n\n###### More details"),
			"#### Improve items\n\n##### Examples\n\n**Details**\n\n**More details**",
		);
	});

	// A body can start with a nested section, so choosing the offset from its first heading would give the wrong hierarchy.
	it("uses the shallowest heading even when it appears later in the body", async () => {
		assert.equal(
			await format("Improve items\n\n###### Details\n\n## Examples\n\n### Measurements"),
			"#### Improve items\n\n**Details**\n\n##### Examples\n\n###### Measurements",
		);
	});

	it("preserves inline formatting when converting the deepest headings", async () => {
		const result = await format(
			"Improve items\n\n#### Examples\n\n###### Compare `before` with [after](https://example.com)",
		);

		// Converting a section heading to a bold label must not flatten its inline code or links into plain text.
		assert.equal(
			result,
			"#### Improve items\n\n##### Examples\n\n**Compare `before` with [after](https://example.com)**",
		);
	});

	// An empty overflowing heading must not produce "****", which Markdown interprets as an unintended horizontal rule.
	it("does not turn empty overflowing headings into thematic breaks", async () => {
		assert.equal(
			await format("Improve items\n\n#### Examples\n\n######"),
			"#### Improve items\n\n##### Examples\n\n",
		);
	});

	// These code examples contain shallower hash-prefixed lines than the real heading.
	// They must neither determine the normalization offset nor be rewritten in the copyable example text.
	it("does not rewrite heading-like content in fenced or indented code blocks", async () => {
		const body = [
			"```markdown",
			"# Inside backticks",
			"###### Still code",
			"```",
			"",
			"~~~markdown",
			"## Inside tildes",
			"~~~",
			"",
			"    # Indented code",
			"",
			"#### Actual heading",
		].join("\n");
		assert.equal(
			await format(`Improve items\n\n${body}`),
			`#### Improve items\n\n${body.replace("#### Actual heading", "##### Actual heading")}`,
		);
	});

	it("preserves paragraphs, lists, tables, links, and indentation", async () => {
		const body = [
			"Details with [a link](https://example.com).",
			"",
			"- First",
			"  - Nested",
			"- Second",
			"",
			"| Before | After |",
			"| --- | --- |",
			"| 2 | 1 |",
			"",
			"    const indented = true;",
		].join("\n");

		// Compare the entire body, not just parsed node types, to catch formatting churn in tables, lists, and code indentation.
		assert.equal(await format(`Improve items\n\n${body}`), `#### Improve items\n\n${body}`);
	});

	// Source-range edits must retain quote and list markers, including indentation for the list's continuation paragraph.
	it("handles headings inside blockquotes and list items", async () => {
		assert.equal(
			await format(
				"Improve items\n\n> #### Quoted heading\n\n- ##### Nested heading\n\n  List details.",
			),
			"#### Improve items\n\n> ##### Quoted heading\n\n- ###### Nested heading\n\n  List details.",
		);
	});

	// Both hash-prefixed (ATX) and underline-style (Setext) headings must preserve their relative levels in the output.
	it("nests shallower ATX and Setext headings beneath the entry title", async () => {
		assert.equal(
			await format("Improve items\n\n# Heading\n\nSetext heading\n---"),
			"#### Improve items\n\n##### Heading\n\n###### Setext heading",
		);
	});

	// Windows line endings must not leave carriage returns in titles or interfere with recognizing body headings.
	it("handles Windows line endings", async () => {
		assert.equal(
			await format("Improve items\r\n\r\n#### Examples\r\n\r\nDetails."),
			"#### Improve items\n\n##### Examples\n\nDetails.",
		);
	});

	it("preserves automatically generated PR and commit links", async () => {
		const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoDir });
		const hash = stdout.trim();
		const result = await getReleaseLine(
			{ id: "example", summary: "Improve items\n\nDetails.", releases: [] },
			"minor",
			{ ...linkOptions, gitlogOptions: { repo: repoDir } },
		);

		// Heading-based entries must retain the navigation links readers use to find the original PR and commit.
		assert.ok(
			result.startsWith("#### Improve items ([#42](https://example.com/repo/pull/42)) ["),
		);
		assert.ok(result.includes(`](https://example.com/repo/commit/${hash})`));
		assert.ok(result.endsWith("\n\nDetails."));
	});

	// Authors may preview an uncommitted changeset; missing Git metadata must not hide its content or leave empty link markup.
	it("retains entries without Git history", async () => {
		const result = await getReleaseLine(
			{ id: "uncommitted", summary: "New change\n\nDetails.", releases: [] },
			"minor",
			{ ...linkOptions, gitlogOptions: { repo: repoDir } },
		);
		assert.equal(result, "#### New change\n\nDetails.");
	});

	// An empty dependency-entry string tells Changesets not to add a separate dependency-update bullet.
	it("continues to omit dependency-only entries", async () => {
		assert.equal(await getDependencyReleaseLine([], [], {}), "");
	});

	it("generates sibling entry headings through the Changesets CLI", async () => {
		const integrationDir = path.join(testDir, "integration");

		// "changeset version" consumes source changesets and updates package files, so run it against a disposable copy.
		// Keep the shared Git fixtures intact for the other cases in this suite.
		await cp(repoDir, integrationDir, { recursive: true });
		await execFileAsync(
			process.execPath,
			[require.resolve("@changesets/cli/bin.js"), "version"],
			{ cwd: integrationDir },
		);
		const changelog = await readFile(path.join(integrationDir, "CHANGELOG.md"), "utf8");
		const { remark } = await import("remark");
		const headings = remark()
			.parse(changelog)
			.children.filter((node) => node.type === "heading");

		// Package -> version -> change category -> first entry -> its subsection -> next entry.
		// Returning to level 4 is the regression guard: the next change must not belong beneath the previous subsection.
		assert.deepEqual(
			headings.map((node) => node.depth),
			[1, 2, 3, 4, 5, 4],
		);

		// Changing entry layout must preserve Changesets' version and bump-category headings, as well as PR navigation.
		assert.ok(changelog.includes("## 1.1.0"));
		assert.ok(changelog.includes("### Minor Changes"));
		assert.ok(changelog.includes("##### Example measurements"));
		assert.ok(changelog.includes("#### Manage branches independently"));
		assert.ok(changelog.includes("https://example.com/repo/pull/42"));
	});
});

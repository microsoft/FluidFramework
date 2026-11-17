/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { mkdir, mkdtemp, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { after, before, describe, it } = require("mocha");
const { remark } = require("remark");

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
			path.join(repoDir, ".changeset", "example.md"),
			'---\n"example-package": minor\n---\nImprove items\n\nDetails.\n',
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

	/**
	 * Formats Markdown without commit or PR links so the content can be compared directly.
	 *
	 * @remarks
	 * Reuse a committed changeset ID to exercise normal Git lookup while suppressing variable link text in content assertions.
	 *
	 * @param {string} summary - The complete changeset Markdown, excluding front matter.
	 * @returns {Promise<string>} The formatted changelog entry.
	 */
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

	/**
	 * Parses and serializes the formatter's actual output for structural Markdown comparisons.
	 *
	 * @remarks
	 * Canonical formatting removes incidental blank-line indentation inside containers.
	 * Parsing the emitted Markdown, not the source AST, ensures malformed block boundaries remain visible in the comparison.
	 *
	 * @param {string} summary - The complete changeset Markdown, excluding front matter.
	 * @returns {Promise<string>} The formatted entry serialized as canonical Markdown.
	 */
	async function formatCanonical(summary) {
		return String(remark().processSync(await format(summary)));
	}

	// Each entry needs its own section so its body headings cannot appear to contain subsequent changes.
	it("formats the summary as a heading instead of a list item", async () => {
		const actual = await format("Improve items");
		const expected = "#### Improve items";
		assert.equal(actual, expected);
	});

	// Level-4 entry titles leave only levels 5 and 6 for body headings; deeper sections must remain readable as bold labels.
	it("preserves relative nesting and renders adjusted levels above 6 as bold labels", async () => {
		const actual = await format(
			"Improve items\n\nDetails.\n\n#### Examples\n\nExample.\n\n##### Measurements\n\nNumbers.\n\n###### Details\n\nMore details.",
		);
		const expected =
			"#### Improve items\n\nDetails.\n\n##### Examples\n\nExample.\n\n###### Measurements\n\nNumbers.\n\n**Details**\n\nMore details.";
		assert.equal(actual, expected);
	});

	// Source depth is an authoring choice, not a restriction.
	// Even a lone level-6 heading becomes level 5 rather than a bold label because it is the shallowest heading in its body.
	for (const depth of [1, 2, 3, 4, 5, 6]) {
		it(`normalizes a level-${depth} body heading to level 5`, async () => {
			const actual = await format(`Improve items\n\n${"#".repeat(depth)} Examples`);
			const expected = "#### Improve items\n\n##### Examples";
			assert.equal(actual, expected);
		});
	}

	// Preserve the author's numeric level gaps: source levels 2, 4, and 6 map to 5, 7, and 9, not consecutive output headings.
	it("preserves gaps between source heading levels", async () => {
		const actual = await format(
			"Improve items\n\n## Examples\n\n#### Details\n\n###### More details",
		);
		const expected = "#### Improve items\n\n##### Examples\n\n**Details**\n\n**More details**";
		assert.equal(actual, expected);
	});

	// A body can start with a nested section, so choosing the offset from its first heading would give the wrong hierarchy.
	it("uses the shallowest heading even when it appears later in the body", async () => {
		const actual = await format(
			"Improve items\n\n###### Details\n\n## Examples\n\n### Measurements",
		);
		const expected =
			"#### Improve items\n\n**Details**\n\n##### Examples\n\n###### Measurements";
		assert.equal(actual, expected);
	});

	it("preserves inline formatting when converting the deepest headings", async () => {
		const actual = await format(
			"Improve items\n\n#### Examples\n\n###### Compare `before` with [after](https://example.com)",
		);

		// Converting a section heading to a bold label must not flatten its inline code or links into plain text.
		const expected =
			"#### Improve items\n\n##### Examples\n\n**Compare `before` with [after](https://example.com)**";
		assert.equal(actual, expected);
	});

	// ATX headings can separate blocks without blank lines, but bold paragraphs cannot.
	// Explicit blank lines in the expected Markdown keep prose and code examples separate from each bold label.
	it("preserves block boundaries around an overflowing heading next to prose", async () => {
		const actual = await format(`Improve items

# Examples

Intro.
### Details
More.`);
		const expected = `#### Improve items

##### Examples

Intro.

**Details**

More.`;
		assert.equal(actual, expected);
	});

	it("preserves indented code immediately after an overflowing heading", async () => {
		const actual = await format(`Improve items

# Examples

###### Details
    const value = 1;`);
		const expected = `#### Improve items

##### Examples

**Details**

    const value = 1;`;
		assert.equal(actual, expected);
	});

	// Without a separator, "---" would become a Setext underline and promote the label to a level-2 heading.
	it("preserves a horizontal rule immediately after an overflowing heading", async () => {
		const actual = await format(`Improve items

# Root

### Deep
---`);
		const expected = `#### Improve items

##### Root

**Deep**

---`;
		assert.equal(actual, expected);
	});

	it("keeps adjacent overflowing headings as separate bold paragraphs", async () => {
		const actual = await format(`Improve items

# Examples

### First
#### Second
More.`);
		const expected = `#### Improve items

##### Examples

**First**

**Second**

More.`;
		assert.equal(actual, expected);
	});

	for (const { name, firstPrefix, prefix, expected: expectedBody } of [
		{
			name: "blockquotes",
			firstPrefix: "> ",
			prefix: "> ",
			expected: `> Intro.
>
> **Details**
>
> More.
>
> **Code**
>
> \`\`\`
> const value = 1;
> \`\`\`
>
> **Rule**
>
> ***
`,
		},
		{
			name: "list items",
			firstPrefix: "- ",
			prefix: "  ",
			expected: `* Intro.

  **Details**

  More.

  **Code**

  \`\`\`
  const value = 1;
  \`\`\`

  **Rule**

  ***
`,
		},
		{
			name: "ordered lists inside blockquotes",
			firstPrefix: "> 12. ",
			prefix: ">     ",
			expected: `> 12. Intro.
>
>     **Details**
>
>     More.
>
>     **Code**
>
>     \`\`\`
>     const value = 1;
>     \`\`\`
>
>     **Rule**
>
>     ***
`,
		},
	]) {
		it(`preserves block boundaries inside ${name}`, async () => {
			const lines = [
				"Intro.",
				"### Details",
				"More.",
				"### Code",
				"    const value = 1;",
				"### Rule",
				"---",
			];
			const source = lines
				.map((line, index) => `${index === 0 ? firstPrefix : prefix}${line}`)
				.join("\n");

			// Added separators must not split a quote or let a label escape its original list item.
			const actual = await formatCanonical(`Improve items\n\n# Examples\n\n${source}`);
			const expected = `#### Improve items

##### Examples

${expectedBody}`;
			assert.equal(actual, expected);
		});
	}

	// A label at the end of a container must not absorb following plain text into that quote or list.
	for (const { name, prefix, expected: expectedContainer } of [
		{ name: "blockquote", prefix: "> ", expected: "> **Details**" },
		{ name: "list item", prefix: "- ", expected: "* **Details**" },
	]) {
		it(`keeps following prose outside a ${name} ending with an overflowing heading`, async () => {
			const actual = await formatCanonical(
				`Improve items\n\n# Examples\n\n${prefix}### Details\nOutside.`,
			);
			const expected = `#### Improve items

##### Examples

${expectedContainer}

Outside.
`;
			assert.equal(actual, expected);
		});
	}

	it("preserves a quoted ordered list starting with an overflowing heading", async () => {
		const actual = await formatCanonical(`Improve items

# Examples

> 12. ### Details
>         const value = 1;

Outside.`);
		const expected = `#### Improve items

##### Examples

> 12. **Details**
>
>     \`\`\`
>     const value = 1;
>     \`\`\`

Outside.
`;
		assert.equal(actual, expected);
	});

	// An empty overflowing heading must not produce "****", which Markdown interprets as an unintended horizontal rule.
	it("does not turn empty overflowing headings into thematic breaks", async () => {
		const actual = await format("Improve items\n\n#### Examples\n\n######");
		const expected = "#### Improve items\n\n##### Examples\n\n";
		assert.equal(actual, expected);
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
		const actual = await format(`Improve items\n\n${body}`);
		const expected = `#### Improve items\n\n${body.replace("#### Actual heading", "##### Actual heading")}`;
		assert.equal(actual, expected);
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
		const actual = await format(`Improve items\n\n${body}`);
		const expected = `#### Improve items\n\n${body}`;
		assert.equal(actual, expected);
	});

	// Source-range edits must retain quote and list markers, including indentation for the list's continuation paragraph.
	it("handles headings inside blockquotes and list items", async () => {
		const actual = await format(
			"Improve items\n\n> #### Quoted heading\n\n- ##### Nested heading\n\n  List details.",
		);
		const expected =
			"#### Improve items\n\n> ##### Quoted heading\n\n- ###### Nested heading\n\n  List details.";
		assert.equal(actual, expected);
	});

	// Both hash-prefixed (ATX) and underline-style (Setext) headings must preserve their relative levels in the output.
	it("nests shallower ATX and Setext headings beneath the entry title", async () => {
		const actual = await format("Improve items\n\n# Heading\n\nSetext heading\n---");
		const expected = "#### Improve items\n\n##### Heading\n\n###### Setext heading";
		assert.equal(actual, expected);
	});

	// Windows line endings must not leave carriage returns in titles or interfere with recognizing body headings.
	it("handles Windows line endings", async () => {
		const actual = await format("Improve items\r\n\r\n#### Examples\r\n\r\nDetails.");
		const expected = "#### Improve items\n\n##### Examples\n\nDetails.";
		assert.equal(actual, expected);
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
		const actual = await getReleaseLine(
			{ id: "uncommitted", summary: "New change\n\nDetails.", releases: [] },
			"minor",
			{ ...linkOptions, gitlogOptions: { repo: repoDir } },
		);
		const expected = "#### New change\n\nDetails.";
		assert.equal(actual, expected);
	});

	// An empty dependency-entry string tells Changesets not to add a separate dependency-update bullet.
	it("continues to omit dependency-only entries", async () => {
		const actual = await getDependencyReleaseLine([], [], {});
		const expected = "";
		assert.equal(actual, expected);
	});
});

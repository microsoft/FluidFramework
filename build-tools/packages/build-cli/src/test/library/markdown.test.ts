/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "mocha";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { normalizeReleaseNoteHeadings } from "../../library/markdown.js";

describe("normalizeReleaseNoteHeadings", () => {
	const processor = remark().use(remarkGfm).use(normalizeReleaseNoteHeadings);

	/**
	 * Normalizes a fresh body and serializes the transformed AST as Markdown.
	 */
	function normalize(source: string): string {
		return String(processor.processSync(source));
	}

	for (const depth of [1, 2, 3, 4, 5, 6]) {
		it(`normalizes a level-${depth} body heading to level 4`, () => {
			const actual = normalize(`${"#".repeat(depth)} Examples`);
			const expected = "#### Examples\n";
			assert.equal(actual, expected);
		});
	}

	// Readers have three real heading levels available beneath each changeset title.
	// Deeper sections must remain readable as bold labels without adding invalid headings to the outline.
	it("preserves relative nesting and converts overflowing headings to bold labels", () => {
		const actual = normalize(`# Examples

## Measurements

### Details

#### Deep details

###### Deeper details`);
		const expected = `#### Examples

##### Measurements

###### Details

**Deep details**

**Deeper details**
`;
		assert.equal(actual, expected);
	});

	// The AST-based release-note path must keep the same block boundaries protected by the changelog formatter.
	// Explicit blank lines and code fences make the expected separation visible in the Markdown.
	it("preserves adjacent prose, indented code, and rules after serializing bold labels", () => {
		const actual = normalize(`# Examples

Intro.
#### Details
    const value = 1;
#### Rule
---`);
		const expected = `#### Examples

Intro.

**Details**

\`\`\`
const value = 1;
\`\`\`

**Rule**

***
`;
		assert.equal(actual, expected);
	});

	// The early level-6 heading overflows, while the later levels 2 and 4 must remain two levels apart.
	// Using the first heading as the baseline or collapsing gaps would change the author's hierarchy.
	it("uses the shallowest heading even when it appears later and preserves level gaps", () => {
		const actual = normalize(`###### Deep details

## Examples

#### Details`);
		const expected = `**Deep details**

#### Examples

###### Details
`;
		assert.equal(actual, expected);
	});

	// A previous changeset's heading levels must not determine how the next changeset is rendered.
	it("normalizes each body independently when the processor is reused", () => {
		for (const { source, expected } of [
			{ source: "# First body", expected: "#### First body\n" },
			{ source: "###### Second body", expected: "#### Second body\n" },
			{ source: "### Third body", expected: "#### Third body\n" },
		]) {
			const actual = normalize(source);
			assert.equal(actual, expected);
		}
	});

	// Overflow changes the section's presentation, not its inline content: code spans and links must remain formatted.
	it("preserves inline formatting in overflowing headings", () => {
		const actual = normalize(
			"# Examples\n\n#### Compare `before` with [after](https://example.com)",
		);
		const expected = `#### Examples

**Compare \`before\` with [after](https://example.com)**
`;
		assert.equal(actual, expected);
	});

	// Setext headings can contain multiline code spans, whereas their normalized ATX replacements cannot span lines.
	// Re-parse and serialize the emitted Markdown so a broken code span cannot pass as a valid transformed AST.
	for (const { source, expectedHeading } of [
		{ source: "`x\ny`\n===", expectedHeading: "#### `x y`" },
		{ source: "> `x\n> y`\n> ===", expectedHeading: "> #### `x y`" },
		{ source: "- `x\n  y`\n  ===", expectedHeading: "* #### `x y`" },
	]) {
		it(`preserves multiline code spans in ${JSON.stringify(source)}`, () => {
			const actual = String(remark().processSync(normalize(source)));
			const expected = `${expectedHeading}\n`;
			assert.equal(actual, expected);
		});
	}

	// HTML inside a heading needs the same single-line representation as code spans, including inside containers.
	for (const { source, expectedHeading } of [
		{
			source: '<a\nhref="https://example.com">Hello</a>\n===',
			expectedHeading: '#### <a href="https://example.com">Hello</a>',
		},
		{
			source: '> <a\n> href="https://example.com">Hello</a>\n> ===',
			expectedHeading: '> #### <a href="https://example.com">Hello</a>',
		},
		{
			source: '- <a\n  href="https://example.com">Hello</a>\n  ===',
			expectedHeading: '* #### <a href="https://example.com">Hello</a>',
		},
	]) {
		it(`preserves multiline inline HTML in ${JSON.stringify(source)}`, () => {
			const actual = String(remark().use(remarkGfm).processSync(normalize(source)));
			const expected = `${expectedHeading}\n`;
			assert.equal(actual, expected);
		});
	}

	// Character references preserve quoted attribute values while keeping the generated heading on one physical line.
	it("preserves line feeds inside quoted HTML attributes", () => {
		const actual = normalize(`> <a
> title="first
> second" data-label='third
> fourth' href="https://example.com">Hello</a>
> ===`);
		const expected = `> #### <a title="first&#10;second" data-label='third&#10;fourth' href="https://example.com">Hello</a>
`;
		assert.equal(actual, expected);
	});

	it("leaves multiline HTML outside headings unchanged", () => {
		const source = `<div
class="example">Block</div>

\`\`\`html
<a
href="https://example.com">Hello</a>
\`\`\`
`;
		const actual = normalize(source);
		const expected = source;
		assert.equal(actual, expected);
	});

	// Serializing an empty bold label as "****" would introduce a horizontal rule the author did not request.
	it("does not turn empty overflowing headings into thematic breaks", () => {
		const actual = normalize("# Examples\n\n####");
		const expected = "#### Examples\n\n";
		assert.equal(actual, expected);
	});

	// The shallower hash-prefixed lines are code, so only the actual level-5 heading may determine the offset.
	// Code examples must retain their literal contents so readers can copy them without heading rewrites.
	it("ignores heading-like content in fenced and indented code blocks", () => {
		const actual = normalize(`\`\`\`markdown
# Fenced example
\`\`\`

    ## Indented example

##### Actual heading`);
		const expected = `\`\`\`markdown
# Fenced example
\`\`\`

\`\`\`
## Indented example
\`\`\`

#### Actual heading
`;
		assert.equal(actual, expected);
	});

	// Headings inside containers must also fit beneath the changeset title, not just headings at the document root.
	it("normalizes headings inside blockquotes and list items", () => {
		const actual = normalize("> ## Quoted heading\n\n- ### Nested heading");
		const expected = `> #### Quoted heading

* ##### Nested heading
`;
		assert.equal(actual, expected);
	});

	// Underline-style headings express the same hierarchy as hash-prefixed headings and must normalize the same way.
	it("preserves relative levels of Setext headings", () => {
		const actual = normalize(`Examples
========

Details
-------`);
		const expected = `#### Examples

##### Details
`;
		assert.equal(actual, expected);
	});

	// A body does not need headings; ordinary paragraphs, lists, and GitHub-flavored Markdown tables remain ordinary blocks.
	it("retains content without headings, including GFM tables", () => {
		const actual = normalize(`Details.

- First
- Second

| Before | After |
| --- | --- |
| 2 | 1 |`);
		const expected = `Details.

* First
* Second

| Before | After |
| ------ | ----- |
| 2      | 1     |
`;
		assert.equal(actual, expected);
	});
});

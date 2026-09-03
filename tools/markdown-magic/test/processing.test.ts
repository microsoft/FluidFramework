/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { RootContent } from "mdast";

import { processDocument } from "../src/processing.js";
import { createTransformRegistry } from "../src/transformRegistry.js";

async function createTempDirectory() {
	return mkdtemp(path.join(os.tmpdir(), "markdown-magic-test-"));
}

async function processHelpRegion(source: string, extension = ".md"): Promise<string> {
	const directory = await createTempDirectory();
	const destinationPath = path.join(directory, `destination${extension}`);
	await writeFile(destinationPath, source);
	await processDocument(destinationPath, createTransformRegistry());
	return readFile(destinationPath, "utf8");
}

test("include parses Markdown into nodes before generation", async () => {
	const directory = await createTempDirectory();
	const sourcePath = path.join(directory, "source.md");
	const destinationPath = path.join(directory, "destination.md");
	await writeFile(sourcePath, "Read the [guide](https://example.com/guide).\n");
	await writeFile(
		destinationPath,
		[
			"Before.",
			"",
			`<!-- markdown-magic:begin {"transform":"include","path":"./source.md"} -->`,
			"",
			"Old content.",
			"",
			"<!-- markdown-magic:end -->",
			"",
			"After.",
		].join("\n"),
	);

	const registry = createTransformRegistry();
	const includeTransform = registry.transforms.include;
	assert(includeTransform !== undefined);
	const nodes = await includeTransform.generate(
		{ path: "./source.md" },
		registry.createContext(destinationPath, "markdown", 2),
	);

	const paragraph = nodes[0];
	assert(paragraph?.type === "paragraph");
	const link = paragraph.children[1];
	assert(link?.type === "link");
	assert.equal(link.url, "https://example.com/guide");

	await processDocument(destinationPath, registry);
	const output = await readFile(destinationPath, "utf8");
	assert.match(output, /^Before\.\n\n<!-- markdown-magic:begin/m);
	assert.match(output, /Read the \[guide\]\(https:\/\/example\.com\/guide\)\./);
	assert.match(output, /<!-- markdown-magic:end -->\n\nAfter\.$/);
});

test("include-code creates a code node", async () => {
	const directory = await createTempDirectory();
	const sourcePath = path.join(directory, "source.ts");
	const destinationPath = path.join(directory, "destination.md");
	await writeFile(sourcePath, "const value = 1;\n");

	const registry = createTransformRegistry();
	const includeCodeTransform = registry.transforms["include-code"];
	assert(includeCodeTransform !== undefined);
	const nodes = await includeCodeTransform.generate(
		{
			path: "./source.ts",
			language: "typescript",
		},
		registry.createContext(destinationPath, "markdown", 2),
	);

	assert.deepEqual(nodes, [
		{
			type: "code",
			lang: "typescript",
			value: "const value = 1;",
		},
	]);
});

test("include applies negative indexes from the end of the source", async () => {
	const directory = await createTempDirectory();
	const sourcePath = path.join(directory, "source.md");
	const destinationPath = path.join(directory, "destination.md");
	await writeFile(sourcePath, "# First\n# Second\n# Third\n# Fourth");

	const registry = createTransformRegistry();
	const includeTransform = registry.transforms.include;
	assert(includeTransform !== undefined);
	const nodes = await includeTransform.generate(
		{ path: "./source.md", start: -3, end: -1 },
		registry.createContext(destinationPath, "markdown", 2),
	);

	assert.equal(nodes.length, 2);
	const secondHeading = nodes[0];
	assert(secondHeading?.type === "heading");
	assert.equal(secondHeading.children[0]?.type, "text");
	assert.equal(secondHeading.children[0].value, "Second");
	const thirdHeading = nodes[1];
	assert(thirdHeading?.type === "heading");
	assert.equal(thirdHeading.children[0]?.type, "text");
	assert.equal(thirdHeading.children[0].value, "Third");
});

test("include resolves reference links defined outside the selected range", async () => {
	const directory = await createTempDirectory();
	const sourcePath = path.join(directory, "source.md");
	const destinationPath = path.join(directory, "destination.mdx");
	await writeFile(
		sourcePath,
		[
			"Read the [guide][guide] and view the ![diagram][diagram].",
			"",
			'[guide]: https://example.com/guide "Guide title"',
			"[diagram]: https://example.com/diagram.png",
		].join("\n"),
	);
	await writeFile(
		destinationPath,
		[
			`{/* markdown-magic:begin {"transform":"include","path":"./source.md","start":0,"end":1} */}`,
			"{/* markdown-magic:end */}",
		].join("\n"),
	);

	await processDocument(destinationPath, createTransformRegistry());
	const output = await readFile(destinationPath, "utf8");
	assert.match(output, /\[guide\]\(https:\/\/example\.com\/guide "Guide title"\)/);
	assert.match(output, /!\[diagram\]\(https:\/\/example\.com\/diagram\.png\)/);
	assert.doesNotMatch(output, /^\[guide\]:/m);
	assert.doesNotMatch(output, /^\[diagram\]:/m);
});

test("include rejects relative link and image targets", async () => {
	const cases = [
		{ source: "Read the [guide](./guide.md).", target: "./guide.md" },
		{
			source: "View the ![diagram][diagram].\n\n[diagram]: ../diagram.png",
			target: "../diagram.png",
		},
	];
	for (const testCase of cases) {
		const directory = await createTempDirectory();
		const sourcePath = path.join(directory, "source.md");
		const destinationPath = path.join(directory, "destination.mdx");
		await writeFile(sourcePath, testCase.source);

		const registry = createTransformRegistry();
		const includeTransform = registry.transforms.include;
		assert(includeTransform !== undefined);
		await assert.rejects(
			async () =>
				includeTransform.generate(
					{ path: "./source.md" },
					registry.createContext(destinationPath, "mdx", 2),
				),
			new RegExp(`relative link target "${testCase.target.replace(".", "\\.")}"`),
		);
	}
});

test("include-code negative indexes count a terminal empty line", async () => {
	const directory = await createTempDirectory();
	const sourcePath = path.join(directory, "source.ts");
	const destinationPath = path.join(directory, "destination.md");
	await writeFile(sourcePath, "first\nsecond\nthird\nfourth\n");

	const registry = createTransformRegistry();
	const includeCodeTransform = registry.transforms["include-code"];
	assert(includeCodeTransform !== undefined);
	const nodes = await includeCodeTransform.generate(
		{ path: "./source.ts", start: -3, end: -1 },
		registry.createContext(destinationPath, "markdown", 2),
	);

	assert.equal(nodes[0]?.type, "code");
	assert.equal(nodes[0].value, "third\nfourth");
});

test("MDX include preserves MDX nodes", async () => {
	const directory = await createTempDirectory();
	const sourcePath = path.join(directory, "source.mdx");
	const destinationPath = path.join(directory, "destination.mdx");
	await writeFile(sourcePath, '<Callout kind="note">\n\nContent\n\n</Callout>\n');

	const registry = createTransformRegistry();
	const includeTransform = registry.transforms.include;
	assert(includeTransform !== undefined);
	const nodes = await includeTransform.generate(
		{ path: "./source.mdx" },
		registry.createContext(destinationPath, "mdx", 2),
	);

	assert.equal(nodes[0]?.type, "mdxJsxFlowElement");
});

test("MDX destinations convert included Markdown comments to MDX comments", async () => {
	const directory = await createTempDirectory();
	const sourcePath = path.join(directory, "source.md");
	const destinationPath = path.join(directory, "destination.mdx");
	await writeFile(sourcePath, "<!-- Included comment. -->\n");
	await writeFile(
		destinationPath,
		[
			`{/* markdown-magic:begin {"transform":"include","path":"./source.md"} */}`,
			"{/* markdown-magic:end */}",
		].join("\n"),
	);

	await processDocument(destinationPath, createTransformRegistry());
	const output = await readFile(destinationPath, "utf8");
	assert.match(output, /\{\/\* Included comment\. \*\/\}/);
});

test("Markdown destinations convert included MDX comments to HTML comments", async () => {
	const directory = await createTempDirectory();
	const sourcePath = path.join(directory, "source.mdx");
	const destinationPath = path.join(directory, "destination.md");
	await writeFile(sourcePath, "{/* Included comment. */}\n");
	await writeFile(
		destinationPath,
		[
			`<!-- markdown-magic:begin {"transform":"include","path":"./source.mdx"} -->`,
			"<!-- markdown-magic:end -->",
		].join("\n"),
	);

	await processDocument(destinationPath, createTransformRegistry());
	const output = await readFile(destinationPath, "utf8");
	assert.match(output, /<!-- Included comment\. -->/);
});

test("Markdown destinations reject MDX nodes", async () => {
	const directory = await createTempDirectory();
	const sourcePath = path.join(directory, "source.mdx");
	const destinationPath = path.join(directory, "destination.md");
	await writeFile(sourcePath, "{value}\n");
	await writeFile(
		destinationPath,
		[
			`<!-- markdown-magic:begin {"transform":"include","path":"./source.mdx"} -->`,
			"",
			"Old content.",
			"",
			"<!-- markdown-magic:end -->",
		].join("\n"),
	);

	await assert.rejects(
		processDocument(destinationPath, createTransformRegistry()),
		/Content from .*source\.mdx.* cannot be generated in Markdown document .*destination\.md/,
	);
});

test("destination serialization rejects unknown future node types", async () => {
	const directory = await createTempDirectory();
	const destinationPath = path.join(directory, "destination.md");
	await writeFile(
		destinationPath,
		[
			`<!-- markdown-magic:begin {"transform":"future-node"} -->`,
			"",
			"Old content.",
			"",
			"<!-- markdown-magic:end -->",
		].join("\n"),
	);

	const baseRegistry = createTransformRegistry();
	const registry = {
		...baseRegistry,
		transforms: {
			...baseRegistry.transforms,
			"future-node": {
				generate: () => [{ type: "mdxFutureNode" } as unknown as RootContent],
			},
		},
	};

	await assert.rejects(processDocument(destinationPath, registry), (error: unknown) => {
		assert(error instanceof Error);
		assert.match(error.message, /cannot be generated in Markdown document/);
		assert(error.cause instanceof Error);
		assert.match(error.cause.message, /Cannot handle unknown node `mdxFutureNode`/);
		return true;
	});
});

test("infers generated heading depth from the region placement", async () => {
	const marker =
		'<!-- markdown-magic:begin {"transform":"help"} -->\n<!-- markdown-magic:end -->';
	const cases = [
		{ name: "document without headings", source: marker, expectedHeading: "# Help" },
		{
			name: "region after the document title",
			source: `# Document\n\n${marker}`,
			expectedHeading: "## Help",
		},
		{
			name: "region between sibling sections",
			source: `# Document\n\n## Before\n\n${marker}\n\n## After`,
			expectedHeading: "## Help",
		},
		{
			name: "region before a child section",
			source: `# Document\n\n## Parent\n\n${marker}\n\n### Child`,
			expectedHeading: "### Help",
		},
		{
			name: "region at the end of a section",
			source: `# Document\n\n## Section\n\nContent.\n\n${marker}`,
			expectedHeading: "## Help",
		},
	];

	for (const { name, source, expectedHeading } of cases) {
		const output = await processHelpRegion(source);
		assert.match(
			output,
			new RegExp(`^${expectedHeading.replaceAll("#", "\\#")}\\n`, "m"),
			name,
		);
	}
});

test("uses an explicit heading level as the generated heading context", async () => {
	const source = [
		"# Document",
		"",
		"#### Preceding section",
		"",
		'<!-- markdown-magic:begin {"transform":"client-requirements","headingLevel":2} -->',
		"<!-- markdown-magic:end -->",
	].join("\n");

	const output = await processHelpRegion(source);
	assert.match(output, /^## Minimum Client Requirements$/m);
	assert.match(output, /^### Supported Runtimes$/m);
});

test("rejects an explicit heading level outside the Markdown range", async () => {
	const marker =
		'<!-- markdown-magic:begin {"transform":"help","headingLevel":7} -->\n<!-- markdown-magic:end -->';

	await assert.rejects(
		processHelpRegion(marker),
		/Option "headingLevel" for "help" must be between 1 and 6/,
	);
});

test("ignores headings in generated regions when it infers heading depth", async () => {
	const source = [
		"# Document",
		"",
		'<!-- markdown-magic:begin {"transform":"help"} -->',
		"",
		"###### Stale generated heading",
		"",
		"<!-- markdown-magic:end -->",
	].join("\n");

	const firstOutput = await processHelpRegion(source);
	assert.match(firstOutput, /^## Help$/m);
	const secondOutput = await processHelpRegion(firstOutput);
	assert.equal(secondOutput, firstOutput);
});

test("infers generated heading depth in MDX", async () => {
	const source = [
		"# Document",
		"",
		'{/* markdown-magic:begin {"transform":"help"} */}',
		"{/* markdown-magic:end */}",
	].join("\n");

	const output = await processHelpRegion(source, ".mdx");
	assert.match(output, /^## Help$/m);
});

test("does not write template headings deeper than level six", async () => {
	const directory = await createTempDirectory();
	const destinationPath = path.join(directory, "destination.md");
	const source = [
		"###### Parent",
		"",
		'<!-- markdown-magic:begin {"transform":"client-requirements"} -->',
		"Old content.",
		"<!-- markdown-magic:end -->",
	].join("\n");
	await writeFile(destinationPath, source);

	await assert.rejects(
		processDocument(destinationPath, createTransformRegistry()),
		/Template heading depth exceeds 6/,
	);
	assert.equal(await readFile(destinationPath, "utf8"), source);
});

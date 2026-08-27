/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

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
	await writeFile(sourcePath, "Read the [guide](./guide.md).\n");
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
		includeTransform.validateOptions({ path: "./source.md" }),
		registry.createContext(destinationPath, "markdown", 2),
	);

	const paragraph = nodes[0];
	assert(paragraph?.type === "paragraph");
	const link = paragraph.children[1];
	assert(link?.type === "link");
	assert.equal(link.url, "./guide.md");

	await processDocument(destinationPath, registry);
	const output = await readFile(destinationPath, "utf8");
	assert.match(output, /^Before\.\n\n<!-- markdown-magic:begin/m);
	assert.match(output, /Read the \[guide\]\(\.\/guide\.md\)\./);
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
		includeCodeTransform.validateOptions({
			path: "./source.ts",
			language: "typescript",
		}),
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

test("MDX include preserves MDX nodes", async () => {
	const directory = await createTempDirectory();
	const sourcePath = path.join(directory, "source.mdx");
	const destinationPath = path.join(directory, "destination.mdx");
	await writeFile(sourcePath, '<Callout kind="note">\n\nContent\n\n</Callout>\n');

	const registry = createTransformRegistry();
	const includeTransform = registry.transforms.include;
	assert(includeTransform !== undefined);
	const nodes = await includeTransform.generate(
		includeTransform.validateOptions({ path: "./source.mdx" }),
		registry.createContext(destinationPath, "mdx", 2),
	);

	assert.equal(nodes[0]?.type, "mdxJsxFlowElement");
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
		/MDX content from .*source\.mdx.* cannot be generated in Markdown document .*destination\.md/,
	);
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

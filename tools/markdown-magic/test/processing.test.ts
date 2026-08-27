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
		registry.createContext(destinationPath, "markdown"),
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
		registry.createContext(destinationPath, "markdown"),
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
		registry.createContext(destinationPath, "mdx"),
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

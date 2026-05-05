/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";

import { cleanedPackageVersion } from "@fluidframework/runtime-utils/internal";
import {
	MockFluidDataStoreRuntime,
	MockSharedObjectServices,
} from "@fluidframework/test-runtime-utils/internal";

import { FluidClientVersion } from "../../codec/index.js";
import { TreeCompressionStrategy } from "../../feature-libraries/index.js";
import {
	configuredSharedTree,
	FormatValidatorBasic,
	SchemaFactory,
	TreeViewConfiguration,
	type SharedTreeOptions,
} from "../../index.js";
import { regenerateSnapshots } from "../snapshots/index.js";
import { testSrcPath } from "../testSrcPath.cjs";

const outputDirectory = path.join(testSrcPath, "shared-tree", "summary-load-snapshots");

const schemaFactory = new SchemaFactory("test schema");
class TestSchema extends schemaFactory.object("parent", {
	label: schemaFactory.string,
	child: schemaFactory.array(
		"nodes",
		schemaFactory.object("child", { count: schemaFactory.number }),
	),
}) {}

/** Enumerates all JSON snapshot files under `dir`, recursively. */
function listSnapshotFiles(dir: string): string[] {
	assert(existsSync(dir));
	const results: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) {
			results.push(...listSnapshotFiles(full));
		} else if (entry.endsWith(".json")) {
			results.push(full);
		} else {
			// Docs (e.g. README.md) are allowed alongside snapshots; anything else is unexpected
			// and likely a mistake we want to surface rather than silently ignore.
			assert(entry.endsWith(".md"), `Unexpected file in snapshot directory: ${full}`);
		}
	}
	return results;
}

/** Build a summary string for `treeEncodeType` × `versionKey` using the standard test schema. */
async function generateSummaryContent(
	treeEncodeType: TreeCompressionStrategy,
	versionKey: string,
): Promise<string> {
	const options: SharedTreeOptions = {
		jsonValidator: FormatValidatorBasic,
		treeEncodeType,
		minVersionForCollab:
			versionKey === cleanedPackageVersion
				? cleanedPackageVersion
				: FluidClientVersion[versionKey as keyof typeof FluidClientVersion],
	};

	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	const factory = configuredSharedTree(options).getFactory();

	const tree = factory.create(dataStoreRuntime, "test");
	const view = tree.viewWith(new TreeViewConfiguration({ schema: TestSchema }));
	view.initialize({ label: "root", child: [] });
	view.root.label = "foo";
	view.root.child.push({ count: 1 });
	view.root.child.push({ count: 2 });

	const { summary } = await tree.summarize(true);
	return `${JSON.stringify(summary, undefined, "\t")}\n`;
}

/**
 * Ensures the snapshot directory contains a summary for every supported
 * `TreeCompressionStrategy` × `minVersionForCollab` combination this build can produce.
 *
 * Each missing variant is generated and (if `addIfMissing`) written to disk under a
 * non-colliding name; otherwise the test fails listing what is missing.
 *
 * We never want to delete or rewrite these snapshots — only add new variants.
 * Persisting summaries written by older code lets us keep loading documents authored
 * by those builds, even if we later change how a summary at the same version would
 * be encoded.
 */
async function checkForMissingSummaries(addIfMissing: boolean): Promise<void> {
	if (!existsSync(outputDirectory)) {
		mkdirSync(outputDirectory, { recursive: true });
	}

	const existingContents = new Set<string>();
	for (const file of listSnapshotFiles(outputDirectory)) {
		existingContents.add(readFileSync(file, "utf8"));
	}

	const missing: { baseName: string; content: string }[] = [];

	for (const treeEncodeType of [
		TreeCompressionStrategy.Compressed,
		TreeCompressionStrategy.Uncompressed,
	]) {
		const treeEncodeKey = TreeCompressionStrategy[treeEncodeType];
		for (const versionKey of [...Object.keys(FluidClientVersion), cleanedPackageVersion]) {
			const content = await generateSummaryContent(treeEncodeType, versionKey);
			if (!existingContents.has(content)) {
				missing.push({
					baseName: `singleTree-${treeEncodeKey}-${versionKey}`,
					content,
				});
			}
		}
	}

	if (missing.length === 0) {
		return;
	}

	if (!addIfMissing) {
		const names = missing.map((missingSummary) => missingSummary.baseName).join(", ");
		assert.fail(
			`Missing summary snapshot(s) for: ${names}. ` +
				`Run with \`pnpm run test:snapshots:regen\` to add them.`,
		);
	}

	for (const { baseName, content } of missing) {
		let suffix = 1;
		let candidate = path.join(outputDirectory, `${baseName}-${suffix}.json`);
		while (existsSync(candidate)) {
			suffix += 1;
			candidate = path.join(outputDirectory, `${baseName}-${suffix}.json`);
		}
		writeFileSync(candidate, content);
	}
}

describe("Summary load regression tests", () => {
	it("has summary snapshots for all supported variants", async () => {
		await checkForMissingSummaries(regenerateSnapshots);
	});

	describe("Load every snapshot with the current minVersionForCollab", () => {
		for (const file of listSnapshotFiles(outputDirectory)) {
			const relativePath = path.relative(outputDirectory, file);
			it(`loads ${relativePath}`, async () => {
				const summaryJson = readFileSync(file, "utf8");

				const options: SharedTreeOptions = {
					jsonValidator: FormatValidatorBasic,
					minVersionForCollab: cleanedPackageVersion,
				};
				const dataStoreRuntime = new MockFluidDataStoreRuntime();
				const factory = configuredSharedTree(options).getFactory();

				const tree = await factory.load(
					dataStoreRuntime,
					"test",
					MockSharedObjectServices.createFromSummary(JSON.parse(summaryJson)),
					factory.attributes,
				);
				// If changes are made to the test summary content, this assertion may need to be updated.
				// The important thing is that the content is loaded and can be read without error, not the specific values.
				const view = tree.viewWith(new TreeViewConfiguration({ schema: TestSchema }));
				assert.equal(view.root.label, "foo");
				assert.deepEqual(
					Array.from(view.root.child, (child) => child.count),
					[1, 2],
				);
			});
		}
	});
});

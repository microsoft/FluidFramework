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

const outputDir = path.join(testSrcPath, "shared-tree", "summary-load-snapshots");

const sf = new SchemaFactory("test schema");
class TestSchema extends sf.object("parent", {
	label: sf.string,
	child: sf.array("nodes", sf.object("child", { count: sf.number })),
}) {}

function listSnapshotFiles(dir: string): string[] {
	if (!existsSync(dir)) {
		return [];
	}
	const results: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) {
			results.push(...listSnapshotFiles(full));
		} else if (entry.endsWith(".json")) {
			results.push(full);
		}
	}
	return results;
}

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
	const stFactory = configuredSharedTree(options).getFactory();

	const tree = stFactory.create(dataStoreRuntime, "test");
	const view = tree.viewWith(new TreeViewConfiguration({ schema: TestSchema }));
	view.initialize({ label: "root", child: [] });
	view.root.label = "foo";
	view.root.child.push({ count: 1 });
	view.root.child.push({ count: 2 });

	const { summary } = await tree.summarize(true);
	return `${JSON.stringify(summary, undefined, "\t")}\n`;
}

async function checkForMissingSummaries(addIfMissing: boolean): Promise<void> {
	if (!existsSync(outputDir)) {
		mkdirSync(outputDir, { recursive: true });
	}

	const existingContents = new Set<string>();
	for (const file of listSnapshotFiles(outputDir)) {
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
		const names = missing.map((m) => m.baseName).join(", ");
		assert.fail(
			`Missing summary snapshot(s) for: ${names}. ` +
				`Run with \`pnpm run test:snapshots:regen\` to add them.`,
		);
	}

	for (const { baseName, content } of missing) {
		let suffix = 1;
		let candidate = path.join(outputDir, `${baseName}-${suffix}.json`);
		while (existsSync(candidate)) {
			suffix += 1;
			candidate = path.join(outputDir, `${baseName}-${suffix}.json`);
		}
		writeFileSync(candidate, content);
	}
}

describe("Summary load regression tests", () => {
	it("has summary snapshots for all supported variants", async () => {
		await checkForMissingSummaries(regenerateSnapshots);
	});

	for (const treeEncodeType of [
		TreeCompressionStrategy.Compressed,
		TreeCompressionStrategy.Uncompressed,
	]) {
		const treeEncodeKey = TreeCompressionStrategy[treeEncodeType];
		describe(`Load singleTree summary with current minVersionForCollab and TreeCompressionStrategy.${treeEncodeKey}`, () => {
			const files = listSnapshotFiles(outputDir).filter((f) =>
				path.basename(f).includes(`-${treeEncodeKey}-`),
			);
			for (const file of files) {
				const relPath = path.relative(outputDir, file);
				it(`loads ${relPath}`, async () => {
					const summaryJson = readFileSync(file, "utf8");

					const options: SharedTreeOptions = {
						jsonValidator: FormatValidatorBasic,
						treeEncodeType,
						minVersionForCollab: cleanedPackageVersion,
					};
					const dataStoreRuntime = new MockFluidDataStoreRuntime();
					const stFactory = configuredSharedTree(options).getFactory();

					const tree = await stFactory.load(
						dataStoreRuntime,
						"test",
						MockSharedObjectServices.createFromSummary(JSON.parse(summaryJson)),
						stFactory.attributes,
					);
					assert(tree !== undefined, "Loaded tree should not be undefined");
				});
			}
		});
	}
});

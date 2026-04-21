/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

async function regenerateOldSummaries(): Promise<void> {
	if (existsSync(outputDir)) {
		console.log(`removing snapshot directory: ${outputDir}`);
		rmSync(outputDir, { recursive: true, force: true });
	}
	mkdirSync(outputDir, { recursive: true });

	for (const treeEncodeType of [
		TreeCompressionStrategy.Compressed,
		TreeCompressionStrategy.Uncompressed,
	]) {
		const treeEncodeKey = TreeCompressionStrategy[treeEncodeType];
		for (const versionKey of Object.keys(FluidClientVersion)) {
			const dir = path.join(outputDir, treeEncodeKey, versionKey);
			mkdirSync(dir, { recursive: true });

			const options: SharedTreeOptions = {
				jsonValidator: FormatValidatorBasic,
				treeEncodeType,
				minVersionForCollab: FluidClientVersion[versionKey as keyof typeof FluidClientVersion],
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
			writeFileSync(
				path.join(dir, `singleTree-${treeEncodeKey}-${versionKey}.json`),
				JSON.stringify(summary, undefined, 2),
			);
		}
	}
}

describe("Summary load regression tests", () => {
	before(async () => {
		if (regenerateSnapshots) {
			await regenerateOldSummaries();
		}
	});

	for (const treeEncodeType of [
		TreeCompressionStrategy.Compressed,
		TreeCompressionStrategy.Uncompressed,
	]) {
		const treeEncodeKey = TreeCompressionStrategy[treeEncodeType];
		describe(`Load singleTree summary with current minVersionForCollab and TreeCompressionStrategy.${treeEncodeKey}`, () => {
			for (const versionKey of Object.keys(FluidClientVersion)) {
				it(`using summary version FluidClientVersion.${versionKey}`, async () => {
					const summaryPath = path.join(
						outputDir,
						treeEncodeKey,
						versionKey,
						`singleTree-${treeEncodeKey}-${versionKey}.json`,
					);
					const summaryJson = readFileSync(summaryPath, "utf8");

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

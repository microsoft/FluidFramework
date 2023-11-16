/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import path from "path";
import { useAsyncDeterministicStableId } from "../../util";
import { testTrees as schemaTestTrees } from "../testTrees";
import { makeSchemaCompressedCodec } from "../../feature-libraries/chunked-forest/codec/compressedCodecs";
import { typeboxValidator } from "../../external-utilities";
import { cursorForJsonableTreeField, defaultSchemaPolicy } from "../../feature-libraries";
import {
	createSchemaSnapshot,
	createSnapshot,
	regenTestDirectory,
	verifyEqualPastSchemaSnapshot,
	verifyEqualPastSnapshot,
} from "./utils";
import { generateTestTrees } from "./testTrees";

const regenerateSnapshots = process.argv.includes("--snapshot");

const dirPathTail = "src/test/snapshots";
const dirPath = path.join(__dirname, `../../../${dirPathTail}/files`);
const schemaDirPath = path.join(__dirname, `../../../${dirPathTail}/schema-files`);

function getFilepath(name: string): string {
	return path.join(dirPath, `${name}.json`);
}

function getSchemaFilepath(name: string): string {
	return path.join(schemaDirPath, `${name}.json`);
}

const testNames = new Set<string>();

describe("snapshot tests", () => {
	if (regenerateSnapshots) {
		regenTestDirectory(dirPath);
	}

	const testTrees = generateTestTrees();

	for (const { name: testName, runScenario, skip = false, only = false } of testTrees) {
		const itFn = only ? it.only : skip ? it.skip : it;

		itFn(`${regenerateSnapshots ? "regenerate " : ""}for ${testName}`, async () => {
			await useAsyncDeterministicStableId(async () => {
				return runScenario(async (tree, innerName) => {
					const fullName = `${testName}-${innerName}`;

					if (testNames.has(fullName)) {
						throw new Error(`Duplicate snapshot name: ${fullName}`);
					}

					testNames.add(fullName);

					const { summary } = await tree.summarize(true);
					// eslint-disable-next-line unicorn/prefer-ternary
					if (regenerateSnapshots) {
						await createSnapshot(getFilepath(fullName), summary);
					} else {
						await verifyEqualPastSnapshot(getFilepath(fullName), summary, fullName);
					}
				});
			});
		});
	}
});

describe("schema snapshots", () => {
	if (regenerateSnapshots) {
		regenTestDirectory(schemaDirPath);
	}

	for (const { name, treeFactory, schemaData } of schemaTestTrees) {
		it(name, async () => {
			const tree = treeFactory();
			const codec = makeSchemaCompressedCodec(
				{ jsonValidator: typeboxValidator },
				schemaData,
				defaultSchemaPolicy,
			);
			const encoded = codec.encode(cursorForJsonableTreeField(tree));

			// eslint-disable-next-line unicorn/prefer-ternary
			if (regenerateSnapshots) {
				await createSchemaSnapshot(getSchemaFilepath(name), encoded);
			} else {
				await verifyEqualPastSchemaSnapshot(getSchemaFilepath(name), encoded, name);
			}
		});
	}
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { useAsyncDeterministicStableId } from "../../util";
import { Any, encodeTreeSchema } from "../../feature-libraries";
import { TreeStoredSchema, storedEmptyFieldSchema } from "../../core";
import { SchemaBuilder, leaf } from "../../domains";
import {
	jsonSequenceRootSchema,
	numberSequenceRootSchema,
	stringSequenceRootSchema,
} from "../utils";
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

const schemaTrees: {
	only?: boolean;
	skip?: boolean;
	name: string;
	schemaData: TreeStoredSchema;
}[] = [
	{
		name: "empty",
		schemaData: {
			rootFieldSchema: storedEmptyFieldSchema,
			nodeSchema: new Map(),
		},
	},
	{
		name: "json-sequence",
		schemaData: jsonSequenceRootSchema,
	},
	{
		name: "string-sequence",
		schemaData: stringSequenceRootSchema,
	},
	{
		name: "number-sequence",
		schemaData: numberSequenceRootSchema,
	},
	{
		name: "handle-sequence",
		schemaData: new SchemaBuilder({
			scope: "HandleSequenceRoot",
		}).intoSchema(SchemaBuilder.sequence(leaf.handle)),
	},
	{
		name: "optional-number",
		schemaData: new SchemaBuilder({
			scope: "OptionalNumberRoot",
		}).intoSchema(SchemaBuilder.optional(leaf.number)),
	},
	{
		name: "any",
		schemaData: new SchemaBuilder({
			scope: "AnyRoot",
		}).intoSchema(Any),
	},
	{
		name: "any-required",
		schemaData: new SchemaBuilder({
			scope: "AnyRequiredRoot",
		}).intoSchema(SchemaBuilder.required(Any)),
	},
];

describe("schema snapshots", () => {
	if (regenerateSnapshots) {
		regenTestDirectory(schemaDirPath);
	}

	for (const { name, schemaData, only = false, skip = false } of schemaTrees) {
		const itFn = only ? it.only : skip ? it.skip : it;
		itFn(`${regenerateSnapshots ? "regenerate " : ""}for ${name}`, async () => {
			const encoded = encodeTreeSchema(schemaData);

			// eslint-disable-next-line unicorn/prefer-ternary
			if (regenerateSnapshots) {
				await createSchemaSnapshot(getSchemaFilepath(name), encoded);
			} else {
				await verifyEqualPastSchemaSnapshot(getSchemaFilepath(name), encoded, name);
			}
		});
	}
});

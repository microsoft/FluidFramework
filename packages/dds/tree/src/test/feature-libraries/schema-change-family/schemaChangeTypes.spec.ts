/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	LeafNodeStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeStoredSchema,
	ValueSchema,
} from "../../../core/index.js";
import { FieldKinds } from "../../../feature-libraries/index.js";
import {
	CompareAndSwapSchemaChangeset,
	NarrowingSchemaChangeset,
	WideningSchemaChangeset,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/schema-change-family/schemaChangeTypes.js";
import { brand } from "../../../util/index.js";
import { fieldSchema } from "../../utils.js";

const numberType = brand<TreeNodeSchemaIdentifier>("number");
const stringType = brand<TreeNodeSchemaIdentifier>("string");

function makeSchema(types: readonly TreeNodeSchemaIdentifier[]): TreeStoredSchema {
	return {
		rootFieldSchema: fieldSchema(FieldKinds.optional, types),
		nodeSchema: new Map([
			[numberType, new LeafNodeStoredSchema(ValueSchema.Number)],
			[stringType, new LeafNodeStoredSchema(ValueSchema.String)],
		]),
	};
}

const empty = makeSchema([]);
const number = makeSchema([numberType]);
const number2 = makeSchema([numberType]);
const string = makeSchema([stringType]);
const numberString = makeSchema([numberType, stringType]);
const numberWithMetadata: TreeStoredSchema = {
	...number,
	rootFieldSchema: {
		...number.rootFieldSchema,
		persistedMetadata: { value: 1 },
	},
};

describe("SchemaChangeset", () => {
	for (const { Changeset, expectedOutput, proposed } of [
		{ Changeset: WideningSchemaChangeset, expectedOutput: numberString, proposed: number },
		{ Changeset: NarrowingSchemaChangeset, expectedOutput: number, proposed: numberString },
	]) {
		describe(Changeset.name, () => {
			describe("output", () => {
				it("selects the appropriate schema when proposed is wider than input", () => {
					assert.equal(new Changeset(number, numberString).output, expectedOutput);
				});

				it("selects the appropriate schema when proposed is narrower than input", () => {
					assert.equal(new Changeset(numberString, number).output, expectedOutput);
				});

				it("prefers proposed when the schemas are equivalent but distinct objects", () => {
					assert.notEqual(number2, number);
					assert.equal(new Changeset(number, number2).output, number2);
				});

				it("preserves proposed metadata when the schemas are equivalent", () => {
					const change = new Changeset(number, numberWithMetadata);
					assert.equal(change.hasConflicts(), false);
					assert.equal(change.output, numberWithMetadata);
				});
			});

			describe("hasConflicts", () => {
				for (const [name, input, expected] of [
					["identical", number, false],
					["equivalent", number2, false],
					["narrower", empty, false],
					["wider", numberString, false],
					["divergent", string, true], // Only divergent schemas should result in conflicts
				] as const) {
					it(`returns ${expected} for ${name} input`, () => {
						assert.equal(new Changeset(input, number).hasConflicts(), expected);
					});
				}
			});

			describe("withInput", () => {
				it("preserves the concrete type and proposal without mutating the source", () => {
					const change = new Changeset(expectedOutput, proposed);
					const updated = change.withInput(proposed);
					assert(updated instanceof Changeset);
					assert.notEqual(updated, change);
					assert.equal(updated.input, proposed);
					assert.equal(updated.proposed, change.proposed);
					assert.equal(updated.output, proposed);
				});
			});
		});
	}

	describe("CompareAndSwapSchemaChangeset", () => {
		describe("output", () => {
			it("returns proposed unchanged, including metadata", () => {
				const change = new CompareAndSwapSchemaChangeset(string, numberWithMetadata);
				assert.equal(change.hasConflicts(), false);
				assert.equal(change.output, numberWithMetadata);
			});
		});

		describe("hasConflicts", () => {
			for (const [name, input, expected] of [
				["identical", number, false],
				["equivalent", number2, false],
				["narrower", empty, true],
				["wider", numberString, true],
				["divergent", string, true],
			] as const) {
				it(`returns ${expected} when input is ${name} relative to the original schema`, () => {
					assert.equal(
						new CompareAndSwapSchemaChangeset(input, input, number).hasConflicts(),
						expected,
					);
				});
			}

			it("ignores metadata differences between original and input", () => {
				assert.equal(
					new CompareAndSwapSchemaChangeset(numberWithMetadata, number, number).hasConflicts(),
					false,
				);
			});
		});

		describe("withInput", () => {
			it("preserves the concrete type, proposal and original schema without mutating the source", () => {
				const change = new CompareAndSwapSchemaChangeset(numberString, string, number);
				const updated = change.withInput(empty);
				assert.notEqual(updated, change);
				assert.equal(updated.input, empty);
				assert.equal(updated.proposed, change.proposed);
				assert.equal(updated.original, change.original);
			});
		});
	});
});

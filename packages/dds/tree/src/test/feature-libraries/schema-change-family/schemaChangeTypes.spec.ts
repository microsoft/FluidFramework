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
	...number2,
	rootFieldSchema: {
		...number2.rootFieldSchema,
		persistedMetadata: { value: 1 },
	},
};

describe("SchemaChangeset", () => {
	describe("invert", () => {
		it("returns a no-op in the actual input context for a conflicted change", () => {
			const inverse = new CompareAndSwapSchemaChangeset(numberString, string, number).invert();
			assert.equal(inverse.output, numberString);
			assert.equal(inverse.hasConflicts(), false);
			assert.equal(inverse.isInverse, true);
		});
	});

	describe("rebase", () => {
		it("ignores a conflicted base rather than its hypothetical output", () => {
			const change = new CompareAndSwapSchemaChangeset(number, string);
			const over = new CompareAndSwapSchemaChangeset(number, numberString, string);
			assert.equal(over.hasConflicts(), true);
			const rebased = change.rebase(over);
			assert.equal(rebased.input, number);
			assert.equal(rebased.hasConflicts(), false);
			assert.equal(rebased.output, string);
			assert.equal(rebased.isInverse, false);
		});

		it("uses the base's output rather than its proposal", () => {
			const change = new CompareAndSwapSchemaChangeset(numberString, string);
			const over = new WideningSchemaChangeset(numberString, number);
			const rebased = change.rebase(over);
			assert.equal(rebased.input, numberString);
			assert.equal(rebased.hasConflicts(), false);
			assert.equal(rebased.isInverse, false);
		});
	});

	for (const { Changeset, Inverse, expectedOutput, otherSchema } of [
		{
			Changeset: WideningSchemaChangeset,
			Inverse: NarrowingSchemaChangeset,
			expectedOutput: numberString,
			otherSchema: number,
		},
		{
			Changeset: NarrowingSchemaChangeset,
			Inverse: WideningSchemaChangeset,
			expectedOutput: number,
			otherSchema: numberString,
		},
	]) {
		describe(Changeset.name, () => {
			describe("output", () => {
				it("selects the appropriate schema when proposed is wider than input", () => {
					assert.equal(new Changeset(number, numberString).output, expectedOutput);
				});

				it("selects the appropriate schema when proposed is narrower than input", () => {
					assert.equal(new Changeset(numberString, number).output, expectedOutput);
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

			describe("rebase", () => {
				it("preserves the concrete type and proposal when the input changes", () => {
					const change = new Changeset(expectedOutput, otherSchema, true);
					const updated = change.rebase(
						new CompareAndSwapSchemaChangeset(expectedOutput, otherSchema),
					);
					assert(updated instanceof Changeset);
					assert.notEqual(updated, change);
					assert.equal(updated.input, otherSchema);
					assert.equal(updated.proposed, change.proposed);
					assert.equal(updated.output, otherSchema);
					assert.equal(updated.isInverse, true);
				});
			});

			describe("invert", () => {
				for (const [name, input, proposal] of [
					["an effective change", otherSchema, expectedOutput],
					["an already satisfied change", expectedOutput, otherSchema],
				] as const) {
					it(`reverses ${name} with the opposite intention`, () => {
						const inverse = new Changeset(input, proposal).invert();
						assert(inverse instanceof Inverse);
						assert.equal(inverse.input, expectedOutput);
						assert.equal(inverse.output, input);
						assert.equal(inverse.hasConflicts(), false);
						assert.equal(inverse.isInverse, true);
					});
				}
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

		describe("rebase", () => {
			it("preserves the concrete type, proposal and original schema when the input changes", () => {
				const change = new CompareAndSwapSchemaChangeset(numberString, string, number, true);
				const updated = change.rebase(new CompareAndSwapSchemaChangeset(numberString, empty));
				assert(updated instanceof CompareAndSwapSchemaChangeset);
				assert.notEqual(updated, change);
				assert.equal(updated.input, empty);
				assert.equal(updated.proposed, change.proposed);
				assert.equal(updated.original, change.original);
				assert.equal(updated.isInverse, true);
			});
		});

		describe("invert", () => {
			it("restores input metadata rather than original metadata", () => {
				const inverse = new CompareAndSwapSchemaChangeset(
					numberWithMetadata,
					string,
					number,
				).invert();

				assert(inverse instanceof CompareAndSwapSchemaChangeset);
				assert.equal(inverse.input, string);
				assert.equal(inverse.original, string);
				assert.equal(inverse.output, numberWithMetadata);
				assert.equal(inverse.hasConflicts(), false);
				assert.equal(inverse.isInverse, true);
			});
		});
	});

	describe("No-op changes", () => {
		const noop = new WideningSchemaChangeset(number, string).invert();

		it("remains a no-op after rebasing", () => {
			const rebased = noop.rebase(new CompareAndSwapSchemaChangeset(number, string));
			assert.equal(rebased.output, string);
			assert.equal(rebased.hasConflicts(), false);
			assert.equal(rebased.isInverse, true);
		});

		it("remains a no-op after inversion", () => {
			const inverse = noop.invert();
			assert.equal(inverse.output, number);
			assert.equal(inverse.hasConflicts(), false);
			assert.equal(inverse.isInverse, true);
			const rebased = inverse.rebase(new CompareAndSwapSchemaChangeset(number, string));
			assert.equal(rebased.output, string);
			assert.equal(rebased.hasConflicts(), false);
		});
	});
});

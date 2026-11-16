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
	describe("rollback", () => {
		it("returns a no-op in the actual input context for a conflicted change", () => {
			const rollback = new CompareAndSwapSchemaChangeset(
				numberString,
				string,
				number,
			).rollback();
			assert.equal(rollback.output, numberString);
			assert.equal(rollback.isConflicted, false);
			assert.equal(rollback.isRollback, true);
		});
	});

	describe("rebase", () => {
		it("ignores a conflicted base rather than its hypothetical output", () => {
			const change = new CompareAndSwapSchemaChangeset(number, string);
			const over = new CompareAndSwapSchemaChangeset(number, numberString, string);
			assert.equal(over.isConflicted, true);
			const rebased = change.rebase(over);
			assert.equal(rebased.input, number);
			assert.equal(rebased.isConflicted, false);
			assert.equal(rebased.output, string);
			assert.equal(rebased.isRollback, false);
		});

		it("uses the base's output rather than its proposal", () => {
			const change = new CompareAndSwapSchemaChangeset(numberString, string);
			const over = new WideningSchemaChangeset(numberString, number);
			const rebased = change.rebase(over);
			assert.equal(rebased.input, numberString);
			assert.equal(rebased.isConflicted, false);
			assert.equal(rebased.isRollback, false);
		});
	});

	for (const { Changeset, Rollback, expectedOutput, otherSchema } of [
		{
			Changeset: WideningSchemaChangeset,
			Rollback: NarrowingSchemaChangeset,
			expectedOutput: numberString,
			otherSchema: number,
		},
		{
			Changeset: NarrowingSchemaChangeset,
			Rollback: WideningSchemaChangeset,
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
					assert.equal(change.isConflicted, false);
					assert.equal(change.output, numberWithMetadata);
				});
			});

			describe("isConflicted", () => {
				for (const [name, input, expected] of [
					["identical", number, false],
					["equivalent", number2, false],
					["narrower", empty, false],
					["wider", numberString, false],
					["divergent", string, true], // Only divergent schemas should result in conflicts
				] as const) {
					it(`returns ${expected} for ${name} input`, () => {
						assert.equal(new Changeset(input, number).isConflicted, expected);
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
					assert.equal(updated.isRollback, true);
				});
			});

			describe("rollback", () => {
				for (const [name, input, proposal] of [
					["an effective change", otherSchema, expectedOutput],
					["an already satisfied change", expectedOutput, otherSchema],
				] as const) {
					it(`rolls back ${name} with the opposite intention`, () => {
						const rollback = new Changeset(input, proposal).rollback();
						assert(rollback instanceof Rollback);
						assert.equal(rollback.input, expectedOutput);
						assert.equal(rollback.output, input);
						assert.equal(rollback.isConflicted, false);
						assert.equal(rollback.isRollback, true);
					});
				}
			});
		});
	}

	describe("CompareAndSwapSchemaChangeset", () => {
		describe("output", () => {
			it("returns proposed unchanged, including metadata", () => {
				const change = new CompareAndSwapSchemaChangeset(string, numberWithMetadata);
				assert.equal(change.isConflicted, false);
				assert.equal(change.output, numberWithMetadata);
			});
		});

		describe("isConflicted", () => {
			for (const [name, input, expected] of [
				["identical", number, false],
				["equivalent", number2, false],
				["narrower", empty, true],
				["wider", numberString, true],
				["divergent", string, true],
			] as const) {
				it(`returns ${expected} when input is ${name} relative to the original schema`, () => {
					assert.equal(
						new CompareAndSwapSchemaChangeset(input, input, number).isConflicted,
						expected,
					);
				});
			}

			it("ignores metadata differences between original and input", () => {
				assert.equal(
					new CompareAndSwapSchemaChangeset(numberWithMetadata, number, number).isConflicted,
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
				assert.equal(updated.isRollback, true);
			});
		});

		describe("rollback", () => {
			it("restores input metadata rather than original metadata", () => {
				const rollback = new CompareAndSwapSchemaChangeset(
					numberWithMetadata,
					string,
					number,
				).rollback();

				assert(rollback instanceof CompareAndSwapSchemaChangeset);
				assert.equal(rollback.input, string);
				assert.equal(rollback.original, string);
				assert.equal(rollback.output, numberWithMetadata);
				assert.equal(rollback.isConflicted, false);
				assert.equal(rollback.isRollback, true);
			});
		});
	});

	describe("No-op changes", () => {
		const noop = new WideningSchemaChangeset(number, string).rollback();

		it("remains a no-op after rebasing", () => {
			const rebased = noop.rebase(new CompareAndSwapSchemaChangeset(number, string));
			assert.equal(rebased.output, string);
			assert.equal(rebased.isConflicted, false);
			assert.equal(rebased.isRollback, true);
		});

		it("remains a no-op after rollback", () => {
			const rollback = noop.rollback();
			assert.equal(rollback.output, number);
			assert.equal(rollback.isConflicted, false);
			assert.equal(rollback.isRollback, true);
			const rebased = rollback.rebase(new CompareAndSwapSchemaChangeset(number, string));
			assert.equal(rebased.output, string);
			assert.equal(rebased.isConflicted, false);
		});
	});
});

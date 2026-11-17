/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

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
	NoopSchemaChangeset,
	type SchemaChangeset,
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
const numberSchema = makeSchema([numberType]);
const numberClone = makeSchema([numberType]);
const string = makeSchema([stringType]);
const numberString = makeSchema([numberType, stringType]);
const numberWithMetadata: TreeStoredSchema = {
	...numberClone,
	rootFieldSchema: {
		...numberClone.rootFieldSchema,
		persistedMetadata: { value: 1 },
	},
};

/* The possible relationships between two schemas */
const inputRelationships = [
	"reference equal",
	"equivalent",
	"narrower",
	"wider",
	"divergent",
] as const;

// Tests typically use the `number` schema as a baseline for comparison with other schema.
// Hang the other schemas off of the number schema by their relationship (e.g. `number.wider` is a schema that is wider than `number`) for convenience.
const number = Object.assign(numberSchema, {
	"reference equal": numberSchema,
	equivalent: numberClone,
	narrower: empty,
	wider: numberString,
	divergent: string,
} satisfies { [key in (typeof inputRelationships)[number]]: TreeStoredSchema });

interface ChangesetImplementation {
	/** Type used for test titles and instance checks */
	type: abstract new (
		...args: never[]
	) => SchemaChangeset;
	create: (
		input: TreeStoredSchema,
		proposed: TreeStoredSchema,
		original?: TreeStoredSchema,
		isRollback?: boolean,
	) => SchemaChangeset;
	expectedOutput: {
		/** What should be the output when input == number and proposed == number.wider? */
		proposedWider: TreeStoredSchema;
		/** What should be the output when input == number and proposed == number.narrower? */
		proposedNarrower: TreeStoredSchema;
		/** What should be the output when input == number and proposed == numberWithMetadata? */
		metadataOnly: TreeStoredSchema;
	};
	/** The complete set of inputs that cause the schema change to be conflicted */
	conflictingInputs: readonly (typeof inputRelationships)[number][];
	/** Type expected when rolling back an unconflicted change */
	rollbackType: abstract new (
		...args: never[]
	) => SchemaChangeset;
}

const implementations: readonly ChangesetImplementation[] = [
	{
		type: WideningSchemaChangeset,
		create: (input, proposed, _original, isRollback) =>
			new WideningSchemaChangeset(input, proposed, isRollback),
		expectedOutput: {
			proposedWider: number.wider,
			proposedNarrower: number,
			metadataOnly: numberWithMetadata,
		},
		conflictingInputs: ["divergent"],
		rollbackType: NarrowingSchemaChangeset,
	},
	{
		type: NarrowingSchemaChangeset,
		create: (input, proposed, _original, isRollback) =>
			new NarrowingSchemaChangeset(input, proposed, isRollback),
		expectedOutput: {
			proposedWider: number,
			proposedNarrower: number.narrower,
			metadataOnly: numberWithMetadata,
		},
		conflictingInputs: ["divergent"],
		rollbackType: WideningSchemaChangeset,
	},
	{
		type: CompareAndSwapSchemaChangeset,
		create: (input, proposed, original, isRollback) =>
			new CompareAndSwapSchemaChangeset(input, proposed, original, isRollback),
		expectedOutput: {
			proposedWider: number.wider,
			proposedNarrower: number.narrower,
			metadataOnly: numberWithMetadata,
		},
		conflictingInputs: ["narrower", "wider", "divergent"],
		rollbackType: CompareAndSwapSchemaChangeset,
	},
	{
		type: NoopSchemaChangeset,
		create: (input, _proposed, _original, isRollback = false) =>
			new NoopSchemaChangeset(input, isRollback),
		expectedOutput: {
			proposedWider: number,
			proposedNarrower: number,
			metadataOnly: number,
		},
		conflictingInputs: [],
		rollbackType: NoopSchemaChangeset,
	},
];

// For the given input and proposed schemas, check that the output matches the value of the corresponding key in the `expectedOutput` of the `ChangesetImplementation`
const schemaPolicies = [
	{
		name: "when proposed is wider than input",
		input: number,
		proposed: number.wider,
		output: "proposedWider",
	},
	{
		name: "when proposed is narrower than input",
		input: number,
		proposed: number.narrower,
		output: "proposedNarrower",
	},
	{
		name: "when the schemas differ only in metadata",
		input: number,
		proposed: numberWithMetadata,
		output: "metadataOnly",
	},
] as const;

describe("SchemaChangeset", () => {
	describe("output", () => {
		for (const { name, input, proposed, output } of schemaPolicies) {
			describe(name, () => {
				for (const implementation of implementations) {
					it(implementation.type.name, () => {
						assert.equal(
							implementation.create(input, proposed).output,
							implementation.expectedOutput[output],
						);
					});
				}
			});
		}

		describe("when proposed is divergent from input", () => {
			for (const implementation of implementations) {
				it(implementation.type.name, () => {
					const change = implementation.create(number, number.divergent);
					if (change instanceof CompareAndSwapSchemaChangeset) {
						assert.equal(change.output, number.divergent);
					} else if (change instanceof NoopSchemaChangeset) {
						assert.equal(change.output, number);
					} else {
						assert.throws(
							() => change.output,
							validateAssertionError(/Cannot get output of a conflicted changeset/),
						);
					}
				});
			}
		});
	});

	describe("isConflicted", () => {
		for (const name of inputRelationships) {
			describe(`when input is ${name} relative to number`, () => {
				for (const implementation of implementations) {
					it(implementation.type.name, () => {
						assert.equal(
							implementation.create(number[name], number, number).isConflicted,
							implementation.conflictingInputs.includes(name),
						);
					});
				}
			});
		}

		describe("ignores metadata differences between input and the expected schema", () => {
			for (const implementation of implementations) {
				it(implementation.type.name, () => {
					assert.equal(
						implementation.create(numberWithMetadata, number, number).isConflicted,
						false,
					);
				});
			}
		});
	});

	describe("rebase", () => {
		describe("has no effect when rebasing over a conflicted change", () => {
			for (const implementation of implementations) {
				it(implementation.type.name, () => {
					const change = implementation.create(number, number.wider);
					const over = new CompareAndSwapSchemaChangeset(number, string, empty);
					const rebased = change.rebase(over);
					assert.equal(rebased.input, number);
					assert.equal(rebased.isConflicted, false);
					assert.equal(rebased.output, implementation.expectedOutput.proposedWider);
					assert.equal(rebased.isRollback, change.isRollback);
				});
			}
		});

		describe("uses the base's output rather than its proposal", () => {
			for (const implementation of implementations) {
				it(implementation.type.name, () => {
					const change = implementation.create(number, number.narrower);
					const over = new WideningSchemaChangeset(number, number.narrower);
					const rebased = change.rebase(over);
					assert.equal(rebased.input, number);
					assert.equal(rebased.output, implementation.expectedOutput.proposedNarrower);
					assert.equal(rebased.isConflicted, false);
					assert.equal(rebased.isRollback, change.isRollback);
				});
			}
		});

		describe("preserves the intention by preserving the concrete type and proposed schema", () => {
			// No-ops are an exception because they do not have an intention to preserve - they just absorb the output of their rebasee as their output
			for (const implementation of implementations.filter(
				({ type: Changeset }) => Changeset !== NoopSchemaChangeset,
			)) {
				it(implementation.type.name, () => {
					const change = implementation.create(number.divergent, number, number, true);
					const updated = change.rebase(
						new CompareAndSwapSchemaChangeset(number.divergent, number.wider),
					);
					assert(updated instanceof implementation.type);
					assert.notEqual(updated, change);
					assert.equal(updated.input, number.wider);
					assert.equal(updated.proposed, number);
					assert.equal(updated.isRollback, true);
				});
			}
		});
	});

	describe("rollback", () => {
		for (const { name, input, proposed, output } of schemaPolicies) {
			describe(`restores the input schema ${name}`, () => {
				for (const implementation of implementations) {
					it(implementation.type.name, () => {
						const rollback = implementation.create(input, proposed).rollback();
						assert(rollback instanceof implementation.rollbackType);
						assert.equal(rollback.input, implementation.expectedOutput[output]);
						assert.equal(rollback.output, input);
						assert.equal(rollback.isConflicted, false);
						assert.equal(rollback.isRollback, true);
					});
				}
			});
		}

		describe("rolling back a conflicted change leaves its input schema unchanged", () => {
			for (const implementation of implementations.filter(
				({ conflictingInputs: conflictingInputRelationships }) =>
					conflictingInputRelationships.length > 0,
			)) {
				it(implementation.type.name, () => {
					const rollback = implementation.create(number.divergent, number, number).rollback();
					assert(rollback instanceof NoopSchemaChangeset);
					assert.equal(rollback.output, number.divergent);
					assert.equal(rollback.isConflicted, false);
					assert.equal(rollback.isRollback, true);
				});
			}
		});
	});

	// This is an additional suite for testing aspects of the CAS implementation that aren't applicable to the other implementations in the generic suite.
	describe("CompareAndSwapSchemaChangeset", () => {
		describe("rebase", () => {
			it("preserves the intention's original-schema precondition", () => {
				const change = new CompareAndSwapSchemaChangeset(number.wider, string, number, true);
				const updated = change.rebase(
					new CompareAndSwapSchemaChangeset(number.wider, number.narrower),
				);
				assert(updated instanceof CompareAndSwapSchemaChangeset);
				assert.equal(updated.original, number);
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

	// This is an additional suite for testing aspects of the no-op implementation that aren't applicable to the other implementations in the generic suite.
	describe("NoopSchemaChangeset", () => {
		const noop = new NoopSchemaChangeset(number, true);

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

	describe("caching", () => {
		class CountingSchemaChangeset extends CompareAndSwapSchemaChangeset {
			public conflictCheckCount = 0;

			protected override hasConflicts(): boolean {
				this.conflictCheckCount++;
				return super.hasConflicts();
			}
		}

		for (const [name, input, expected] of [
			["unconflicted", number, false],
			["conflicted", number.divergent, true],
		] as const) {
			it(`computes and caches the ${name} result on first access`, () => {
				const change = new CountingSchemaChangeset(input, number, number);
				assert.equal(change.conflictCheckCount, 0);
				assert.equal(change.isConflicted, expected);
				assert.equal(change.isConflicted, expected);
				if (expected) {
					assert.throws(
						() => change.output,
						validateAssertionError(/Cannot get output of a conflicted changeset/),
					);
				} else {
					assert.equal(change.output, number);
				}
				assert.equal(change.conflictCheckCount, 1);
			});

			it(`does not reuse a cached ${name} result after rebasing`, () => {
				const change = new CompareAndSwapSchemaChangeset(input, number, number);
				assert.equal(change.isConflicted, expected);

				const updated = change.rebase(
					new CompareAndSwapSchemaChangeset(input, expected ? number : number.divergent),
				);

				assert.equal(updated.isConflicted, !expected);
				assert.equal(change.isConflicted, expected);
			});
		}
	});
});

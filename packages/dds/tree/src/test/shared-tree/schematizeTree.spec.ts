/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert, fail } from "assert";
import {
	Any,
	FlexTreeSchema,
	FlexFieldSchema,
	FieldKinds,
	allowsRepoSuperset,
	defaultSchemaPolicy,
	NewFieldContent,
	intoStoredSchema,
} from "../../feature-libraries/index.js";
import { CheckoutEvents, ITreeCheckout } from "../../shared-tree/index.js";
import {
	AllowedUpdateType,
	TreeStoredSchema,
	TreeStoredSchemaRepository,
} from "../../core/index.js";
import { jsonSequenceRootSchema } from "../utils.js";
// eslint-disable-next-line import/no-internal-modules
import { TreeContent, initializeContent, schematize } from "../../shared-tree/schematizedTree.js";
import { createEmitter } from "../../events/index.js";
import { SchemaBuilder, leaf } from "../../domains/index.js";

const builder = new SchemaBuilder({ scope: "test", name: "Schematize Tree Tests" });
const root = leaf.number;
const schema = builder.intoSchema(SchemaBuilder.optional(root));

const builderGeneralized = new SchemaBuilder({
	scope: "test",
	name: "Schematize Tree Tests Generalized",
});

const schemaGeneralized = builderGeneralized.intoSchema(SchemaBuilder.optional(Any));

const builderValue = new SchemaBuilder({ scope: "test", name: "Schematize Tree Tests2" });

const schemaValueRoot = builderValue.intoSchema(SchemaBuilder.required(Any));

const emptySchema = new SchemaBuilder({
	scope: "Empty",
	lint: {
		rejectEmpty: false,
		rejectForbidden: false,
	},
}).intoSchema(FlexFieldSchema.empty);

function expectSchema(actual: TreeStoredSchema, expected: TreeStoredSchema): void {
	// Check schema match
	assert(allowsRepoSuperset(defaultSchemaPolicy, actual, expected));
	assert(allowsRepoSuperset(defaultSchemaPolicy, expected, actual));
}

function makeSchemaRepository(repository: TreeStoredSchemaRepository): {
	storedSchema: ITreeCheckout["storedSchema"];
	updateSchema: ITreeCheckout["updateSchema"];
} {
	return {
		storedSchema: repository,
		updateSchema: (newSchema: TreeStoredSchema) => {
			// This test repository applies the schema immediately.
			repository.apply(newSchema);
		},
	};
}

describe("schematizeTree", () => {
	describe("initializeContent", () => {
		function testInitialize<TRoot extends FlexFieldSchema>(
			name: string,
			content: TreeContent<TRoot>,
		): void {
			describe(`Initialize ${name}`, () => {
				it("correct output", () => {
					const storedSchema = new TreeStoredSchemaRepository();
					let count = 0;
					initializeContent(makeSchemaRepository(storedSchema), content.schema, () => {
						count++;
					});
					assert.equal(count, 1);
					expectSchema(storedSchema, intoStoredSchema(content.schema));
				});

				it("is compatible", () => {
					// TODO:
					// Currently we do not have a function which tests that data is compatible with a given schema. When such a function is available
					// this test should be updated to use it to greatly increase its validation.

					const storedSchema = new TreeStoredSchemaRepository();
					let previousSchema: TreeStoredSchema = new TreeStoredSchemaRepository(
						storedSchema,
					);
					expectSchema(storedSchema, previousSchema);

					storedSchema.on("afterSchemaChange", () => {
						previousSchema = new TreeStoredSchemaRepository(storedSchema);
					});

					let currentData: NewFieldContent;
					initializeContent(makeSchemaRepository(storedSchema), content.schema, () => {
						// TODO: check currentData is compatible with current schema.
						// TODO: check data in cursors is compatible with current schema.
						currentData = content.initialTree;
					});

					// Ensure final schema change was actually tested.
					// This would fail if event is triggered before schema update so last update is missed (and first update checks noop).
					expectSchema(storedSchema, previousSchema);
				});

				it("has expected steps", () => {
					const storedSchema = new TreeStoredSchemaRepository();
					const log: string[] = [];

					storedSchema.on("afterSchemaChange", () => {
						log.push("schema");
					});
					initializeContent(makeSchemaRepository(storedSchema), content.schema, () =>
						log.push("content"),
					);

					assert.deepEqual(
						log,
						content.schema.rootFieldSchema.kind === FieldKinds.required
							? ["schema", "content", "schema"]
							: ["schema", "content"],
					);
				});
			});
		}

		testInitialize("optional-empty", { schema, initialTree: undefined });
		testInitialize("optional-full", { schema, initialTree: 5 });
		testInitialize("value", { schema: schemaValueRoot, initialTree: 6 });

		// TODO: Test schema validation of initial tree (once we have a utility for it)
	});

	describe("schematize", () => {
		describe("noop upgrade", () => {
			const testCases: [string, FlexTreeSchema][] = [
				["empty", emptySchema],
				["basic-optional", schema],
				["basic-value", schemaValueRoot],
				["complex", jsonSequenceRootSchema],
			];
			for (const [name, data] of testCases) {
				it(name, () => {
					const events = createEmitter<CheckoutEvents>();
					const storedSchema = new TreeStoredSchemaRepository(intoStoredSchema(data));

					// Error if modified
					storedSchema.on("afterSchemaChange", () => {
						fail();
					});

					// No op upgrade with AllowedUpdateType.None does not error
					schematize(events, makeSchemaRepository(storedSchema), {
						allowedSchemaModifications: AllowedUpdateType.None,
						schema: data,
					});
				});
			}
		});

		it("upgrade works", () => {
			const events = createEmitter<CheckoutEvents>();
			const storedSchema = new TreeStoredSchemaRepository(intoStoredSchema(schema));

			schematize(events, makeSchemaRepository(storedSchema), {
				allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
				schema: schemaGeneralized,
			});
			expectSchema(storedSchema, intoStoredSchema(schemaGeneralized));
		});

		it("upgrade schema errors when in AllowedUpdateType.None", () => {
			const events = createEmitter<CheckoutEvents>();
			const storedSchema = new TreeStoredSchemaRepository(intoStoredSchema(schema));
			assert.throws(() => {
				schematize(events, makeSchemaRepository(storedSchema), {
					allowedSchemaModifications: AllowedUpdateType.None,
					schema: schemaGeneralized,
				});
			});
		});

		it("incompatible upgrade errors and does not modify schema", () => {
			const events = createEmitter<CheckoutEvents>();
			const storedSchema = new TreeStoredSchemaRepository(
				intoStoredSchema(schemaGeneralized),
			);

			let modified = false;
			storedSchema.on("afterSchemaChange", () => {
				modified = true;
			});

			assert.throws(() => {
				schematize(events, makeSchemaRepository(storedSchema), {
					allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
					schema,
				});
			});

			// Schema should be unchanged
			assert(!modified);
			expectSchema(storedSchema, intoStoredSchema(schemaGeneralized));
		});

		it("errors at correct time when schema changes to not be compatible with view schema", () => {
			const events = createEmitter<CheckoutEvents>();
			const storedSchema = new TreeStoredSchemaRepository(intoStoredSchema(schema));

			schematize(events, makeSchemaRepository(storedSchema), {
				allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
				schema: schemaGeneralized,
			});

			// transient should be ignored.
			storedSchema.apply(intoStoredSchema(schema));
			storedSchema.apply(intoStoredSchema(schemaGeneralized));
			events.emit("afterBatch");

			storedSchema.apply(intoStoredSchema(schema));
			assert.throws(() => events.emit("afterBatch"));
		});
	});
});

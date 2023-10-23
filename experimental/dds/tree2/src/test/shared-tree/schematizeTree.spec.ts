/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert, fail } from "assert";
import {
	Any,
	TreeSchema,
	TreeFieldSchema,
	FieldKinds,
	allowsRepoSuperset,
	defaultSchemaPolicy,
	NewFieldContent,
} from "../../feature-libraries";
import { ViewEvents } from "../../shared-tree";
import {
	AllowedUpdateType,
	SimpleObservingDependent,
	InMemoryStoredSchemaRepository,
	TreeStoredSchema,
	cloneSchemaData,
} from "../../core";
import { jsonSequenceRootSchema } from "../utils";
// eslint-disable-next-line import/no-internal-modules
import { TreeContent, initializeContent, schematize } from "../../shared-tree/schematizedTree";
import { createEmitter } from "../../events";
import { SchemaBuilder, leaf } from "../../domains";

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
}).intoSchema(TreeFieldSchema.empty);

function expectSchema(actual: TreeStoredSchema, expected: TreeStoredSchema): void {
	// Check schema match
	assert(allowsRepoSuperset(defaultSchemaPolicy, actual, expected));
	assert(allowsRepoSuperset(defaultSchemaPolicy, expected, actual));
}

describe("schematizeTree", () => {
	describe("initializeContent", () => {
		function testInitialize<TRoot extends TreeFieldSchema>(
			name: string,
			content: TreeContent<TRoot>,
		): void {
			describe(`Initialize ${name}`, () => {
				it("correct output", () => {
					const storedSchema = new InMemoryStoredSchemaRepository();
					let count = 0;
					initializeContent(storedSchema, content.schema, () => {
						count++;
					});
					assert.equal(count, 1);
					expectSchema(storedSchema, content.schema);
				});

				it("is compatible", () => {
					// TODO:
					// Currently we do not have a function which tests that data is compatible with a given schema. When such a function is available
					// this test should be updated to use it to greatly increase its validation.

					const storedSchema = new InMemoryStoredSchemaRepository();
					let previousSchema: TreeStoredSchema = cloneSchemaData(storedSchema);
					expectSchema(storedSchema, previousSchema);

					let currentData: NewFieldContent;

					storedSchema.registerDependent(
						new SimpleObservingDependent(() => {
							// This should run after the schema change.

							// TODO: check currentData compatible with previousSchema.
							// TODO: check currentData compatible with storedSchema.

							previousSchema = cloneSchemaData(storedSchema);
						}),
					);

					initializeContent(storedSchema, content.schema, () => {
						// TODO: check currentData is compatible with current schema.
						// TODO: check data in cursors is compatible with current schema.
						currentData = content.initialTree;
					});

					// Ensure final schema change was actually tested.
					// This would fail if event is triggered before schema update so last update is missed (and first update checks noop).
					expectSchema(storedSchema, previousSchema);
				});

				it("has expected steps", () => {
					const storedSchema = new InMemoryStoredSchemaRepository();
					const log: string[] = [];

					storedSchema.registerDependent(
						new SimpleObservingDependent(() => log.push("schema")),
					);
					initializeContent(storedSchema, content.schema, () => log.push("content"));

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
			const testCases: [string, TreeSchema][] = [
				["empty", emptySchema],
				["basic-optional", schema],
				["basic-value", schemaValueRoot],
				["complex", jsonSequenceRootSchema],
			];
			for (const [name, data] of testCases) {
				it(name, () => {
					const events = createEmitter<ViewEvents>();
					const storedSchema = new InMemoryStoredSchemaRepository(data);

					// Error if modified
					storedSchema.registerDependent(new SimpleObservingDependent(() => fail()));

					// No op upgrade with AllowedUpdateType.None does not error
					schematize(events, storedSchema, {
						allowedSchemaModifications: AllowedUpdateType.None,
						schema: data,
					});
				});
			}
		});

		it("upgrade works", () => {
			const events = createEmitter<ViewEvents>();
			const storedSchema = new InMemoryStoredSchemaRepository(schema);

			schematize(events, storedSchema, {
				allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
				schema: schemaGeneralized,
			});
			expectSchema(storedSchema, schemaGeneralized);
		});

		it("upgrade schema errors when in AllowedUpdateType.None", () => {
			const events = createEmitter<ViewEvents>();
			const storedSchema = new InMemoryStoredSchemaRepository(schema);
			assert.throws(() => {
				schematize(events, storedSchema, {
					allowedSchemaModifications: AllowedUpdateType.None,
					schema: schemaGeneralized,
				});
			});
		});

		it("incompatible upgrade errors and does not modify schema", () => {
			const events = createEmitter<ViewEvents>();
			const storedSchema = new InMemoryStoredSchemaRepository(schemaGeneralized);

			let modified = false;
			storedSchema.registerDependent(
				new SimpleObservingDependent(() => {
					modified = true;
				}),
			);

			assert.throws(() => {
				schematize(events, storedSchema, {
					allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
					schema,
				});
			});

			// Schema should be unchanged
			assert(!modified);
			expectSchema(storedSchema, schemaGeneralized);
		});

		it("errors at correct time when schema changes to not be compatible with view schema", () => {
			const events = createEmitter<ViewEvents>();
			const storedSchema = new InMemoryStoredSchemaRepository(schema);

			schematize(events, storedSchema, {
				allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
				schema: schemaGeneralized,
			});

			// transient should be ignored.
			storedSchema.update(schema);
			storedSchema.update(schemaGeneralized);
			events.emit("afterBatch");

			storedSchema.update(schema);
			assert.throws(() => events.emit("afterBatch"));
		});
	});
});

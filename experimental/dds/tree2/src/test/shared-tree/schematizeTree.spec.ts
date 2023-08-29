/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert, fail } from "assert";
import {
	SchemaBuilder,
	Any,
	TypedSchemaCollection,
	FieldSchema,
	FieldKinds,
	allowsRepoSuperset,
	defaultSchemaPolicy,
	NewFieldContent,
} from "../../feature-libraries";
import { ViewEvents } from "../../shared-tree";
import {
	ValueSchema,
	AllowedUpdateType,
	SimpleObservingDependent,
	InMemoryStoredSchemaRepository,
	SchemaData,
} from "../../core";
import { jsonSequenceRootSchema } from "../utils";
// eslint-disable-next-line import/no-internal-modules
import { TreeContent, initializeContent, schematize } from "../../shared-tree/schematizedTree";
import { createEmitter } from "../../events";

const builder = new SchemaBuilder("Schematize Tree Tests");
const root = builder.leaf("root", ValueSchema.Number);
const schema = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(Any));

const builderGeneralized = new SchemaBuilder("Schematize Tree Tests Generalized");
const rootGeneralized = builderGeneralized.leaf("root", ValueSchema.Serializable);
const schemaGeneralized = builderGeneralized.intoDocumentSchema(SchemaBuilder.fieldOptional(Any));

const builderValue = new SchemaBuilder("Schematize Tree Tests");
const root2 = builderValue.leaf("root", ValueSchema.Number);
const schemaValueRoot = builderValue.intoDocumentSchema(SchemaBuilder.fieldValue(Any));

const emptySchema = new SchemaBuilder("Empty", {
	rejectEmpty: false,
	rejectForbidden: false,
}).intoDocumentSchema(SchemaBuilder.field(FieldKinds.forbidden));

function expectSchema(actual: SchemaData, expected: SchemaData): void {
	// Check schema match
	assert(allowsRepoSuperset(defaultSchemaPolicy, actual, expected));
	assert(allowsRepoSuperset(defaultSchemaPolicy, expected, actual));
}

describe("schematizeTree", () => {
	describe("initializeContent", () => {
		function testInitialize<TRoot extends FieldSchema>(
			name: string,
			content: TreeContent<TRoot>,
		): void {
			describe(`Initialize ${name}`, () => {
				it("correct output", () => {
					const storedSchema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy);
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

					const storedSchema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy);
					let previousSchema: SchemaData = storedSchema.clone();
					expectSchema(storedSchema, previousSchema);

					let currentData: NewFieldContent;

					storedSchema.registerDependent(
						new SimpleObservingDependent(() => {
							// This should run after the schema change.

							// TODO: check currentData compatible with previousSchema.
							// TODO: check currentData compatible with storedSchema.

							previousSchema = storedSchema.clone();
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
					const storedSchema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy);
					const log: string[] = [];

					storedSchema.registerDependent(
						new SimpleObservingDependent(() => log.push("schema")),
					);
					initializeContent(storedSchema, content.schema, () => log.push("content"));

					assert.deepEqual(
						log,
						content.schema.rootFieldSchema.kind === FieldKinds.value
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
			const testCases: [string, TypedSchemaCollection][] = [
				["empty", emptySchema],
				["basic-optional", schema],
				["basic-value", schemaValueRoot],
				["complex", jsonSequenceRootSchema],
			];
			for (const [name, data] of testCases) {
				it(name, () => {
					const events = createEmitter<ViewEvents>();
					const storedSchema = new InMemoryStoredSchemaRepository(
						defaultSchemaPolicy,
						data,
					);

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
			const storedSchema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy, schema);

			schematize(events, storedSchema, {
				allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
				schema: schemaGeneralized,
			});
			expectSchema(storedSchema, schemaGeneralized);
		});

		it("upgrade schema errors when in AllowedUpdateType.None", () => {
			const events = createEmitter<ViewEvents>();
			const storedSchema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy, schema);
			assert.throws(() => {
				schematize(events, storedSchema, {
					allowedSchemaModifications: AllowedUpdateType.None,
					schema: schemaGeneralized,
				});
			});
		});

		it("incompatible upgrade errors and does not modify schema", () => {
			const events = createEmitter<ViewEvents>();
			const storedSchema = new InMemoryStoredSchemaRepository(
				defaultSchemaPolicy,
				schemaGeneralized,
			);

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
			const storedSchema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy, schema);

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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
	MockFluidDataStoreRuntime,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils";
import { SchemaBuilder, Any, TypedSchemaCollection, FieldSchema } from "../../feature-libraries";
import { ISharedTreeView, SharedTreeFactory } from "../../shared-tree";
import {
	ValueSchema,
	AllowedUpdateType,
	storedEmptyFieldSchema,
	SimpleObservingDependent,
} from "../../core";
import { typeboxValidator } from "../../external-utilities";
import { TestTreeProviderLite } from "../utils";

const factory = new SharedTreeFactory({ jsonValidator: typeboxValidator });

const builder = new SchemaBuilder("Schematize Tree Tests");
const root = builder.leaf("root", ValueSchema.Number);
const schema = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(Any));

const builderGeneralized = new SchemaBuilder("Schematize Tree Tests Generalized");
const rootGeneralized = builderGeneralized.leaf("root", ValueSchema.Serializable);
const schemaGeneralized = builderGeneralized.intoDocumentSchema(SchemaBuilder.fieldOptional(Any));

const builderValue = new SchemaBuilder("Schematize Tree Tests");
const root2 = builderValue.leaf("root", ValueSchema.Number);
const schemaValueRoot = builderValue.intoDocumentSchema(SchemaBuilder.fieldValue(Any));

describe("schematizeView", () => {
	function testInitialize<TRoot extends FieldSchema>(
		name: string,
		documentSchema: TypedSchemaCollection<TRoot>,
	): void {
		describe(`Initialize with ${name} root`, () => {
			function expectSchema(tree: ISharedTreeView): void {
				assert.equal(
					tree.storedSchema.rootFieldSchema.kind.identifier,
					documentSchema.rootFieldSchema.kind.identifier,
				);
				assert.deepEqual(
					tree.storedSchema.rootFieldSchema.types,
					documentSchema.rootFieldSchema.types,
				);
				assert(tree.storedSchema.treeSchema.has(root.name));
				assert.equal(tree.root, 10);
			}

			it("initialize tree schema", () => {
				const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
				assert.equal(tree.storedSchema.rootFieldSchema, storedEmptyFieldSchema);

				tree.schematize({
					allowedSchemaModifications: AllowedUpdateType.None,
					initialTree: 10 as any,
					schema: documentSchema,
				});
				expectSchema(tree);
			});

			it("initialization works with collaboration", () => {
				const provider = new TestTreeProviderLite(2, factory);
				const tree = provider.trees[0];

				tree.schematize({
					allowedSchemaModifications: AllowedUpdateType.None,
					initialTree: 10 as any,
					schema: documentSchema,
				});

				expectSchema(tree);
				provider.processMessages();
				expectSchema(tree);
				expectSchema(provider.trees[1]);
			});

			it("concurrent initialization", () => {
				const provider = new TestTreeProviderLite(2, factory);
				const tree = provider.trees[0];
				const tree2 = provider.trees[1];

				tree.schematize({
					allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
					initialTree: 10 as any,
					schema: documentSchema,
				});

				tree2.schematize({
					allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
					initialTree: 10 as any,
					schema: documentSchema,
				});

				expectSchema(tree);
				expectSchema(tree2);
				provider.processMessages();
				expectSchema(tree);
				expectSchema(tree2);
			});
		});
	}

	testInitialize("optional", schema);
	testInitialize("value", schemaValueRoot);

	it("noop upgrade", () => {
		const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
		tree.storedSchema.update(schema);

		// No op upgrade with AllowedUpdateType.None does not error
		const schematized = tree.schematize({
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: 10,
			schema,
		});
		// And does not add initial tree:
		assert.equal(schematized.root, undefined);
	});

	it("upgrade schema errors when in AllowedUpdateType.None", () => {
		const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
		tree.storedSchema.update(schema);
		assert.throws(() => {
			tree.schematize({
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: "x",
				schema: schemaGeneralized,
			});
		});
	});

	it("incompatible upgrade errors", () => {
		const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
		tree.storedSchema.update(schemaGeneralized);
		assert.throws(() => {
			tree.schematize({
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: "x",
				schema,
			});
		});
	});

	it("upgrade schema", () => {
		const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
		tree.storedSchema.update(schema);
		const schematized = tree.schematize({
			allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
			initialTree: "x",
			schema: schemaGeneralized,
		});
		// Initial tree should not be applied
		assert.equal(schematized.root, undefined);
	});

	it("errors if schema changes to not be compatible with view schema", () => {
		const provider = new TestTreeProviderLite(2, factory);
		const tree = provider.trees[0];
		const tree2 = provider.trees[1];

		const treeLog = [];
		tree.events.on("afterBatch", () => treeLog.push("afterBatch"));
		tree.storedSchema.registerDependent(
			new SimpleObservingDependent(() => treeLog.push("schemaChange")),
		);

		const schematized = tree.schematize({
			allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
			initialTree: "x",
			schema: schemaGeneralized,
		});

		treeLog.push("schematized");
		provider.processMessages();
		treeLog.push("processed messages");

		tree2.transaction.start();
		tree2.storedSchema.update(schema);
		tree2.transaction.commit();

		// Error should occur here, but current limitation on schema editing defers the error until the following tree content edit.
		provider.processMessages();

		assert.throws(
			() => tree.setContent(11),
			(e: Error) => validateAssertionError(e, /schema changed/),
		);
	});
});

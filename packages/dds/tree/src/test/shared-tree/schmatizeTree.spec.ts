/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { FieldKinds, TypedSchema, SchemaAware } from "../../feature-libraries";
import { SharedTreeFactory, schematizeBranch } from "../../shared-tree";
import { rootFieldKey, ValueSchema, AllowedUpdateType } from "../../core";

const factory = new SharedTreeFactory();

describe("schematizeBranch", () => {
	it("initialize tree schema", () => {
		const tree = factory.create(new MockFluidDataStoreRuntime(), "test");

		const root = TypedSchema.tree("root", { value: ValueSchema.Number });
		const schema = SchemaAware.typedSchemaData(
			[[rootFieldKey, TypedSchema.fieldUnrestricted(FieldKinds.value)]],
			root,
		);

		assert(!tree.storedSchema.globalFieldSchema.has(rootFieldKey));

		const schematized = schematizeBranch(tree, {
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: 10,
			schema,
		});

		assert(schematized.storedSchema.globalFieldSchema.has(rootFieldKey));
		assert(schematized.storedSchema.treeSchema.has(root.name));
		assert.equal(schematized.root, 10);
	});

	it("upgrade schema", () => {
		const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
		const root1 = TypedSchema.tree("root", { value: ValueSchema.Number });
		{
			const schema = SchemaAware.typedSchemaData(
				[[rootFieldKey, TypedSchema.fieldUnrestricted(FieldKinds.value)]],
				root1,
			);
			schematizeBranch(tree, {
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: 10,
				schema,
			});
		}

		assert.equal(tree.storedSchema.treeSchema.get(root1.name)?.value, ValueSchema.Number);

		// No op upgrade with AllowedUpdateType.None does not error
		{
			const root = TypedSchema.tree("root", { value: ValueSchema.Number });
			const schema = SchemaAware.typedSchemaData(
				[[rootFieldKey, TypedSchema.fieldUnrestricted(FieldKinds.value)]],
				root,
			);
			schematizeBranch(tree, {
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: 10,
				schema,
			});
		}

		{
			const root = TypedSchema.tree("root", { value: ValueSchema.Serializable });
			const schema = SchemaAware.typedSchemaData(
				[[rootFieldKey, TypedSchema.fieldUnrestricted(FieldKinds.value)]],
				root,
			);
			// Upgrade with AllowedUpdateType.None errors
			assert.throws(() => {
				schematizeBranch(tree, {
					allowedSchemaModifications: AllowedUpdateType.None,
					initialTree: "x",
					schema,
				});
			});
			// Upgrade with AllowedUpdateType.SchemaCompatible works
			const schematized = schematizeBranch(tree, {
				allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
				initialTree: "x",
				schema,
			});
			// Should still have initial tree from first schematize.
			assert.equal(schematized.root, 10);
		}

		assert.equal(tree.storedSchema.treeSchema.get(root1.name)?.value, ValueSchema.Serializable);
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { Any } from "../../feature-libraries";
import { createSharedTreeView } from "../../shared-tree";
import { AllowedUpdateType, mintRevisionTag, storedEmptyFieldSchema } from "../../core";
import { leaf, SchemaBuilder } from "../../domains";

const builder = new SchemaBuilder({
	scope: "test",
	name: "Schematize Tree Tests",
});
const schema = builder.toDocumentSchema(SchemaBuilder.optional(leaf.number));

const builderGeneralized = new SchemaBuilder({
	scope: "test",
	name: "Schematize Tree Tests Generalized",
});

const schemaGeneralized = builderGeneralized.toDocumentSchema(SchemaBuilder.optional(Any));

describe("sharedTreeView", () => {
	describe("schematize", () => {
		it("initialize tree", () => {
			const tree = createSharedTreeView(mintRevisionTag);
			assert.equal(tree.storedSchema.rootFieldSchema, storedEmptyFieldSchema);

			tree.schematize({
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: 10 as any,
				schema,
			});
			assert.equal(tree.root, 10);
		});

		it("noop upgrade", () => {
			const tree = createSharedTreeView(mintRevisionTag);
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

		it("incompatible upgrade errors", () => {
			const tree = createSharedTreeView(mintRevisionTag);
			tree.storedSchema.update(schemaGeneralized);
			assert.throws(() => {
				tree.schematize({
					allowedSchemaModifications: AllowedUpdateType.None,
					initialTree: 5,
					schema,
				});
			});
		});

		it("upgrade schema", () => {
			const tree = createSharedTreeView(mintRevisionTag);
			tree.storedSchema.update(schema);
			const schematized = tree.schematize({
				allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
				initialTree: 5,
				schema: schemaGeneralized,
			});
			// Initial tree should not be applied
			assert.equal(schematized.root, undefined);
		});
	});
});

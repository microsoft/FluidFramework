/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { SchemaBuilder, Any } from "../../feature-libraries";
import { createSharedTreeView } from "../../shared-tree";
import { ValueSchema, AllowedUpdateType, storedEmptyFieldSchema } from "../../core";

const builder = new SchemaBuilder("Schematize Tree Tests");
const root = builder.leaf("root", ValueSchema.Number);
const schema = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(root));

const builderGeneralized = new SchemaBuilder("Schematize Tree Tests Generalized");
const rootGeneralized = builderGeneralized.leaf("root", ValueSchema.Number);
const schemaGeneralized = builderGeneralized.intoDocumentSchema(SchemaBuilder.fieldOptional(Any));

describe("sharedTreeView", () => {
	describe("schematize", () => {
		it("initialize tree", () => {
			const tree = createSharedTreeView();
			assert.equal(tree.storedSchema.rootFieldSchema, storedEmptyFieldSchema);

			tree.schematize({
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: 10 as any,
				schema,
			});
			assert.equal(tree.root, 10);
		});

		it("noop upgrade", () => {
			const tree = createSharedTreeView();
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
			const tree = createSharedTreeView();
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
			const tree = createSharedTreeView();
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

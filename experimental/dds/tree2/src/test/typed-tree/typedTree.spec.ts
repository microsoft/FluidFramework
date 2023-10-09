/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SchemaBuilder } from "../../feature-libraries";
import { ForestType } from "../../shared-tree";
import { ValueSchema, AllowedUpdateType } from "../../core";
import { typeboxValidator } from "../../external-utilities";
import { TypedTreeFactory } from "../../typed-tree";

describe("TypedTree", () => {
	it("editable-tree-2-end-to-end", () => {
		const builder = new SchemaBuilder("e2e");
		const numberSchema = builder.leaf("number", ValueSchema.Number);
		const schema = builder.intoDocumentSchema(SchemaBuilder.fieldRequired(numberSchema));
		const factory = new TypedTreeFactory({
			jsonValidator: typeboxValidator,
			forest: ForestType.Reference,
			allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
			initialTree: 1,
			schema,
			subtype: "test",
		});
		const root = factory.create(new MockFluidDataStoreRuntime(), "the tree").root;
		root.content += 1;
		assert.equal(root.content, 2);
	});
});

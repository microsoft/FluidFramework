/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { ForestType, TypedTreeFactory } from "../../shared-tree";
import { AllowedUpdateType } from "../../core";
import { typeboxValidator } from "../../external-utilities";
import { leaf, SchemaBuilder } from "../../domains";

describe("TypedTree", () => {
	it("editable-tree-2-end-to-end", () => {
		const builder = new SchemaBuilder({ scope: "e2e" });
		const schema = builder.intoSchema(leaf.number);
		const factory = new TypedTreeFactory({
			jsonValidator: typeboxValidator,
			forest: ForestType.Reference,
			subtype: "test",
		});
		const root = factory.create(new MockFluidDataStoreRuntime(), "the tree").schematize({
			allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
			initialTree: 1,
			schema,
		});
		root.content += 1;
		assert.equal(root.content, 2);
	});
});

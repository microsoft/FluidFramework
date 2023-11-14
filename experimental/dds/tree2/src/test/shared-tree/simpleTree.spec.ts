/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { ForestType, TypedTreeFactory } from "../../shared-tree/";
import { AllowedUpdateType } from "../../core";
import { typeboxValidator } from "../../external-utilities";
import { SchemaBuilder } from "../../domains";

describe("SimpleTree", () => {
	it("simple-tree end to end", () => {
		const builder = new SchemaBuilder({ scope: "e2e" });
		const Node = builder.object("Node", { item: builder.number });
		const schema = builder.intoSchema(Node);
		const factory = new TypedTreeFactory({
			jsonValidator: typeboxValidator,
			forest: ForestType.Reference,
			subtype: "test",
		});
		const view = factory.create(new MockFluidDataStoreRuntime(), "the tree").schematize({
			allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
			initialTree: { item: 1 },
			schema,
		});
		view.root.item += 1;
		assert.equal(view.root.item, 2);
	});
});

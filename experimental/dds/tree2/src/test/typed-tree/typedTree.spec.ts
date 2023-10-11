/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SchemaBuilder } from "../../feature-libraries";
import { ForestType } from "../../shared-tree";
import { AllowedUpdateType } from "../../core";
import { typeboxValidator } from "../../external-utilities";
import { TypedTreeFactory } from "../../typed-tree";
import { leaf } from "../../domains";

describe("TypedTree", () => {
	it("editable-tree-2-end-to-end", () => {
		const builder = new SchemaBuilder({ scope: "e2e", libraries: [leaf.library] });
		const schema = builder.toDocumentSchema(SchemaBuilder.fieldRequired(leaf.number));
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

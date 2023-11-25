/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
// eslint-disable-next-line import/no-internal-modules
import { SchemaFactory } from "../../class-tree/schemaFactory";
import { ITree, TreeConfiguration, TreeView } from "../../class-tree";
import { TreeFactory } from "../../treeFactory";

// Since this no longer follows the builder pattern, it is a SchemaFactory instead of a SchemaBuilder.
const schema = new SchemaFactory("com.example");

const BoxRef = () => Box;
schema.fixRecursiveReference(BoxRef);

class Box extends schema.object("Box", {
	/**
	 * Doc comment on a schema based field. Intellisense should work when referencing the field.
	 */
	text: schema.string,
	/**
	 * Example optional field.
	 * Works the same as before.
	 */
	child: schema.optional([BoxRef]),
}) {}

const config = new TreeConfiguration(Box, () => new Box({ text: "hi", child: undefined }));

function setup(tree: ITree) {
	const view: TreeView<Box> = tree.schematize(config);
	const stuff = view.root.child;
}

describe("Recursive Class based end to end example", () => {
	it("test", () => {
		const factory = new TreeFactory({});
		const theTree = factory.create(new MockFluidDataStoreRuntime(), "tree");
		setup(theTree);
	});
});

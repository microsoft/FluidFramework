/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import { SchemaFactory } from "../../class-tree/schemaFactory";
import { ITree } from "../../class-tree";
// eslint-disable-next-line import/no-internal-modules
import { TreeConfiguration, TreeView } from "../../class-tree/tree";

// Since this no longer follows the builder pattern its a SchemaFactory instead of a SchemaBuilder.
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

const config = new TreeConfiguration(Box, () => new Box({ text: "hi" }));

function setup(tree: ITree) {
	const view: TreeView<Box> = tree.schematize(config);
	const stuff = view.root.child;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import { strict as assert, fail } from "node:assert";
import { SchemaFactory, TreeViewConfiguration } from "../simple-tree/index.js";

const schemaFactory = new SchemaFactory("test");

class Child extends schemaFactory.object("Child", {
	data: schemaFactory.string,
}) {}
class Parent extends schemaFactory.array("Parent", Child) {}

const config = new TreeViewConfiguration({
	schema: Parent,
	preventAmbiguity: true,
	enableSchemaValidation: true,
});

describe("DataStores", () => {
	it("x", () => {
		// // TODO: Ideally we would use a local-server service-client, but one does not appear to exist.
		// const tinyliciousClient = new TinyliciousClient();
		// const { container } = await tinyliciousClient.createContainer(containerSchema, "2");
		// const tree = container.initialObjects.tree;
		// assert.equal(tree.tree.root.nuts, 5);
		// tree.tree.root.nuts += 1;
		// assert.equal(tree.tree.root.bolts, 6);
	});
});

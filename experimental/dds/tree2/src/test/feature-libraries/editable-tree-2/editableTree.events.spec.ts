/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";

import { FieldKinds, SchemaBuilder } from "../../../feature-libraries";
import { TypedTreeFactory } from "../../../typed-tree";
import { ForestType } from "../../../shared-tree";
import { typeboxValidator } from "../../../external-utilities";
import { AllowedUpdateType, leaf } from "../../..";

describe("beforeChange/afterChange events", () => {
	const builder = new SchemaBuilder({
		scope: "beforeChange/afterChange events",
		libraries: [leaf.library],
	});
	const myInnerNodeSchema = builder.struct("myInnerNode", {
		myInnerString: SchemaBuilder.required(leaf.string),
	});
	const myNodeSchema = builder.struct("myNode", {
		child: SchemaBuilder.required(myInnerNodeSchema),
		myString: SchemaBuilder.required(leaf.string),
		myOptionalNumber: SchemaBuilder.optional(leaf.number),
	});
	const schema = builder.toDocumentSchema(SchemaBuilder.field(FieldKinds.required, myNodeSchema));
	const factory = new TypedTreeFactory({
		jsonValidator: typeboxValidator,
		forest: ForestType.Reference,
		subtype: "test",
	});

	it("fire the expected number of times", () => {
		const tree = factory.create(new MockFluidDataStoreRuntime(), "the tree");
		const root = tree.schematize({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: 3,
				child: { myInnerString: "initial string in child" },
			},
			schema,
			allowedSchemaModifications: AllowedUpdateType.None,
		}).content;

		let rootBeforeChangeCount = 0;
		let rootAfterChangeCount = 0;
		let childBeforeChangeCount = 0;
		let childAfterChangeCount = 0;

		root.on("beforeChange", (args: unknown) => {
			rootBeforeChangeCount++;
		});
		root.on("afterChange", (args: unknown) => {
			rootAfterChangeCount++;
		});

		assert.strictEqual(rootBeforeChangeCount, 0);
		assert.strictEqual(rootAfterChangeCount, 0);

		// Replace existing node - myString; should fire events on the root node.
		root.myString = "new string";

		assert.strictEqual(rootBeforeChangeCount, 1);
		assert.strictEqual(rootAfterChangeCount, 1);

		// Add node where there was none before - child; should fire events on the root node.
		// TODO: update to `root.child = <something>;` once assignment to struct nodes is implemented in EditableTree2
		root.boxedChild.content = {
			myInnerString: "initial string in original child",
		};

		assert.strictEqual(rootBeforeChangeCount, 2);
		assert.strictEqual(rootAfterChangeCount, 2);

		root.child.on("beforeChange", (args: unknown) => {
			childBeforeChangeCount++;
		});
		root.child.on("afterChange", (args: unknown) => {
			childAfterChangeCount++;
		});

		assert.strictEqual(childBeforeChangeCount, 0);
		assert.strictEqual(childAfterChangeCount, 0);

		// Replace myString in child; should fire events on the child node and the root node.
		root.child.myInnerString = "new string in original child";

		assert.strictEqual(rootBeforeChangeCount, 3);
		assert.strictEqual(rootAfterChangeCount, 3);
		assert.strictEqual(childBeforeChangeCount, 1);
		assert.strictEqual(childAfterChangeCount, 1);

		// Replace the whole child; should fire events on the root node.
		// TODO: update to `root.child = <something>;` once assignment to struct nodes is implemented in EditableTree2
		root.boxedChild.content = {
			myInnerString: "initial string in new child",
		};

		assert.strictEqual(rootBeforeChangeCount, 4);
		assert.strictEqual(rootAfterChangeCount, 4);
		// No events should have fired on the old address node.
		assert.strictEqual(childBeforeChangeCount, 1);
		assert.strictEqual(childAfterChangeCount, 1);

		// Replace myInnerString in new child node; should fire events on the root node (but not on the old child node)
		root.child.myInnerString = "new string in new child";

		assert.strictEqual(rootBeforeChangeCount, 5);
		assert.strictEqual(rootAfterChangeCount, 5);
		// No events should have fired on the old address node.
		assert.strictEqual(childBeforeChangeCount, 1);
		assert.strictEqual(childAfterChangeCount, 1);

		// Delete node - myOptionalNumber; should fire events on the root node
		root.myOptionalNumber = undefined;

		assert.strictEqual(rootBeforeChangeCount, 6);
		assert.strictEqual(rootAfterChangeCount, 6);
	});

	it("fire in the expected order and always together", () => {
		const tree = factory.create(new MockFluidDataStoreRuntime(), "the tree");
		const root = tree.schematize({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				child: { myInnerString: "initial string in child" },
			},
			schema,
			allowedSchemaModifications: AllowedUpdateType.None,
		}).content;

		let beforeCounter = 0;
		let afterCounter = 0;

		root.on("beforeChange", (args: unknown) => {
			beforeCounter++;
			assert.strictEqual(afterCounter, beforeCounter - 1, "beforeChange fired out of order");
		});
		root.on("afterChange", (args: unknown) => {
			afterCounter++;
			assert.strictEqual(afterCounter, beforeCounter, "afterChange fired out of order");
		});

		// Make updates of different kinds to the tree
		// Replace an existing node
		root.myString = "new string";
		// Add a node where there was none before
		root.myOptionalNumber = 3;
		// Delete a node
		root.myOptionalNumber = undefined;
		// Other miscellaneous updates
		root.child.myInnerString = "new string in child";
		// TODO: update to `root.child = <something>;` once assignment to struct nodes is implemented in EditableTree2
		root.boxedChild.content = {
			myInnerString: "original string in new child",
		};
		root.child.myInnerString = "new string in new child";

		// Check the number of events fired is correct (otherwise the assertions in the listeners might not have ran)
		assert.strictEqual(beforeCounter, 6);
		assert.strictEqual(afterCounter, 6);
	});

	it("listeners can be removed successfully", () => {
		const tree = factory.create(new MockFluidDataStoreRuntime(), "the tree");
		const root = tree.schematize({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				child: { myInnerString: "initial string in child" },
			},
			schema,
			allowedSchemaModifications: AllowedUpdateType.None,
		}).content;

		let beforeHasFired = false;
		let afterHasFired = false;

		const unsubscribeBeforeChange = root.on("beforeChange", (args: unknown) => {
			assert.strictEqual(
				beforeHasFired,
				false,
				"beforeChange listener ran after being removed",
			);
			beforeHasFired = true;
		});
		const unsubscribeAfterChange = root.on("afterChange", (args: unknown) => {
			assert.strictEqual(
				afterHasFired,
				false,
				"beforeChange listener ran after being removed",
			);
			afterHasFired = true;
		});

		// Make a change that causes the listeners to fire
		root.myString = "new string 1";

		// Confirm listeners fired once
		assert.strictEqual(beforeHasFired, true);
		assert.strictEqual(afterHasFired, true);

		// Remove listeners
		unsubscribeAfterChange();
		unsubscribeBeforeChange();

		// Make another change; if the listeners fire again, they'll cause an assertion failure
		root.myString = "new string 2";
	});

	it("tree is in correct state when events fire - primitive node deletions", () => {
		const initialNumber = 20;
		const tree = factory.create(new MockFluidDataStoreRuntime(), "the tree");
		const root = tree.schematize({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: initialNumber,
				child: { myInnerString: "initial string in child" },
			},
			schema,
			allowedSchemaModifications: AllowedUpdateType.None,
		}).content;

		let totalListenerCalls = 0;

		root.on("beforeChange", (args: unknown) => {
			assert.strictEqual(root.myOptionalNumber, initialNumber);
			totalListenerCalls++;
		});
		root.on("afterChange", (args: unknown) => {
			assert.strictEqual(root.myOptionalNumber, undefined);
			totalListenerCalls++;
		});

		root.myOptionalNumber = undefined;
		assert.strictEqual(totalListenerCalls, 2);
	});

	it("tree is in correct state when events fire - primitive node additions", () => {
		const tree = factory.create(new MockFluidDataStoreRuntime(), "the tree");
		const root = tree.schematize({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				child: { myInnerString: "initial string in child" },
			},
			schema,
			allowedSchemaModifications: AllowedUpdateType.None,
		}).content;

		const newNumber = 20;

		let totalListenerCalls = 0;

		root.on("beforeChange", (args: unknown) => {
			assert.strictEqual(root.myOptionalNumber, undefined);
			totalListenerCalls++;
		});
		root.on("afterChange", (args: unknown) => {
			assert.strictEqual(root.myOptionalNumber, newNumber);
			totalListenerCalls++;
		});

		root.myOptionalNumber = newNumber;
		assert.strictEqual(totalListenerCalls, 2);
	});

	it("tree is in correct state when events fire - primitive node replacements", () => {
		const tree = factory.create(new MockFluidDataStoreRuntime(), "the tree");
		const root = tree.schematize({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				child: { myInnerString: "initial string in child" },
			},
			schema,
			allowedSchemaModifications: AllowedUpdateType.None,
		}).content;
		let totalListenerCalls = 0;
		const newString = "John";

		root.on("beforeChange", (args: unknown) => {
			assert.strictEqual(root.myString, "initial string");
			totalListenerCalls++;
		});
		root.on("afterChange", (args: unknown) => {
			assert.strictEqual(root.myString, newString);
			totalListenerCalls++;
		});

		root.myString = newString;
		assert.strictEqual(totalListenerCalls, 2);
	});

	it("not emitted by nodes when they are replaced", () => {
		const tree = factory.create(new MockFluidDataStoreRuntime(), "the tree");
		const root = tree.schematize({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				child: { myInnerString: "initial string in child" },
			},
			schema,
			allowedSchemaModifications: AllowedUpdateType.None,
		}).content;

		let beforeCounter = 0;
		let afterCounter = 0;
		root.child.on("beforeChange", (args: unknown) => {
			beforeCounter++;
		});
		root.child.on("afterChange", (args: unknown) => {
			afterCounter++;
		});

		// TODO: update to `root.child = <something>;` once assignment to struct nodes is implemented in EditableTree2
		root.boxedChild.content = { myInnerString: "something" };

		// Events shouldn't have fired on the original myString node
		assert.strictEqual(beforeCounter, 0);
		assert.strictEqual(afterCounter, 0);
	});

	it("bubble up from the affected node to the root", () => {
		const tree = factory.create(new MockFluidDataStoreRuntime(), "the tree");
		const root = tree.schematize({
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				child: { myInnerString: "initial string in child" },
			},
			schema,
			allowedSchemaModifications: AllowedUpdateType.None,
		}).content;

		let rootBeforeCounter = 0;
		let rootAfterCounter = 0;
		let childBeforeCounter = 0;
		let childAfterCounter = 0;

		root.on("beforeChange", (args: unknown) => {
			rootBeforeCounter++;
			// Counts should match only after root counter has been increased
			assert.strictEqual(rootBeforeCounter, childBeforeCounter);
		});
		root.on("afterChange", (args: unknown) => {
			rootAfterCounter++;
			// Counts should match only after root counter has been increased
			assert.strictEqual(rootAfterCounter, childAfterCounter);
		});
		root.child.on("beforeChange", (args: unknown) => {
			// Counts should match only before child counter has been increased
			assert.strictEqual(rootBeforeCounter, childBeforeCounter);
			childBeforeCounter++;
		});
		root.child.on("afterChange", (args: unknown) => {
			// Counts should match only before child counter has been increased
			assert.strictEqual(rootAfterCounter, childAfterCounter);
			childAfterCounter++;
		});

		root.child.myInnerString = "new value";

		// Events shouldn't have fired on the original myString node
		assert.strictEqual(rootBeforeCounter, 1);
		assert.strictEqual(rootAfterCounter, 1);
		assert.strictEqual(childBeforeCounter, 1);
		assert.strictEqual(childAfterCounter, 1);
	});
});

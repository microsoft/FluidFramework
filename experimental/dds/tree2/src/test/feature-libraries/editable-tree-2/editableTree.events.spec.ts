/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";

import { FieldKinds, SchemaBuilder } from "../../../feature-libraries";
import { AllowedUpdateType } from "../../../core";
import { TypedTreeFactory } from "../../../typed-tree";
import { ForestType } from "../../../shared-tree";
import { typeboxValidator } from "../../../external-utilities";
import { leaf } from "../../..";

describe("beforeChange/afterChange events", () => {
	const builder = new SchemaBuilder({
		scope: "beforeChange/afterChange events",
		libraries: [leaf.library],
	});
	const myInnerNodeSchema = builder.struct("myInnerNode", {
		myInnerString: SchemaBuilder.required(leaf.string),
	});
	const myNodeSchema = builder.structRecursive("myNode", {
		child: SchemaBuilder.required(myInnerNodeSchema),
		myString: SchemaBuilder.required(leaf.string),
		myOptionalNumber: SchemaBuilder.optional(leaf.number),
	});
	const schema = builder.toDocumentSchema(SchemaBuilder.field(FieldKinds.required, myNodeSchema));

	it.only("fire the expected number of times", () => {
		// TODO: once assignment to properties is implemented in EditableTree2, update this test to apply changes like
		//   root.myString = "new string";
		// instead of
		//   root.boxedMyString.content = "new string";

		const factory = new TypedTreeFactory({
			jsonValidator: typeboxValidator,
			forest: ForestType.Reference,
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: {
				myString: "initial string",
				myOptionalNumber: 3,
				child: { myInnerString: "initial string in child" },
			},
			schema,
			subtype: "test",
		});

		const root = factory.create(new MockFluidDataStoreRuntime(), "the tree").root.content;

		let rootBeforeChangeCount = 0;
		let rootAfterChangeCount = 0;
		let childBeforeChangeCount = 0;
		let childAfterChangeCount = 0;

		root.on("beforeChange", (event) => {
			rootBeforeChangeCount++;
		});
		root.on("afterChange", (event) => {
			rootAfterChangeCount++;
		});

		assert.strictEqual(rootBeforeChangeCount, 0);
		assert.strictEqual(rootAfterChangeCount, 0);

		// Replace existing node - myString; should fire events on the root node.
		root.boxedMyString.content = "new string";

		assert.strictEqual(rootBeforeChangeCount, 1);
		assert.strictEqual(rootAfterChangeCount, 1);

		// Add node where there was none before - child; should fire events on the root node.
		// This also lets us put listeners on it, otherwise get complaints that root.child might be undefined below.
		root.boxedChild.content = {
			myInnerString: "initial string in original child",
		};

		assert.strictEqual(rootBeforeChangeCount, 2);
		assert.strictEqual(rootAfterChangeCount, 2);

		root.child?.on("beforeChange", (event) => {
			childBeforeChangeCount++;
		});
		root.child?.on("afterChange", (event) => {
			childAfterChangeCount++;
		});

		assert.strictEqual(childBeforeChangeCount, 0);
		assert.strictEqual(childAfterChangeCount, 0);

		// Replace myString in child; should fire events on the child node and the root node.
		root.child.boxedMyInnerString.content = "new string in original child";

		assert.strictEqual(rootBeforeChangeCount, 3);
		assert.strictEqual(rootAfterChangeCount, 3);
		assert.strictEqual(childBeforeChangeCount, 1);
		assert.strictEqual(childAfterChangeCount, 1);

		// Replace the whole child; should fire events on the root node.
		root.boxedChild.content = {
			myInnerString: "initial string in new child",
		};

		assert.strictEqual(rootBeforeChangeCount, 4);
		assert.strictEqual(rootAfterChangeCount, 4);
		// No events should have fired on the old address node.
		assert.strictEqual(childBeforeChangeCount, 1);
		assert.strictEqual(childAfterChangeCount, 1);

		// Replace myInnerString in new child node; should fire events on the root node (but not on the old child node)
		root.child.boxedMyInnerString.content = "new string in new child";

		assert.strictEqual(rootBeforeChangeCount, 5);
		assert.strictEqual(rootAfterChangeCount, 5);
		// No events should have fired on the old address node.
		assert.strictEqual(childBeforeChangeCount, 1);
		assert.strictEqual(childAfterChangeCount, 1);

		// Delete node - myOptionalNumber; should fire events on the root node
		root.boxedMyOptionalNumber.content = undefined;

		assert.strictEqual(rootBeforeChangeCount, 6);
		assert.strictEqual(rootAfterChangeCount, 6);
	});

	it.only("fire in the expected order and always together", () => {
		// TODO: once assignment to properties is implemented in EditableTree2, update this test to apply changes like
		//   root.myString = "new string";
		// instead of
		//   root.boxedMyString.content = "new string";

		const factory = new TypedTreeFactory({
			jsonValidator: typeboxValidator,
			forest: ForestType.Reference,
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				child: { myInnerString: "initial string in child" },
			},
			schema,
			subtype: "test",
		});

		const root = factory.create(new MockFluidDataStoreRuntime(), "the tree").root.content;

		let beforeCounter = 0;
		let afterCounter = 0;

		root.on("beforeChange", (event) => {
			beforeCounter++;
			assert.strictEqual(afterCounter, beforeCounter - 1, "beforeChange fired out of order");
		});
		root.on("afterChange", (event) => {
			afterCounter++;
			assert.strictEqual(afterCounter, beforeCounter, "afterChange fired out of order");
		});

		// Make updates of different kinds to the tree
		// Replace an existing node
		root.boxedMyString.content = "new string";
		// Add a node where there was none before
		root.boxedMyOptionalNumber.content = 3;
		// Delete a node
		root.boxedMyOptionalNumber.content = undefined;
		// Other miscellaneous updates
		root.child.boxedMyInnerString.content = "new string in child";
		root.boxedChild.content = {
			myInnerString: "original string in new child",
		};
		root.child.boxedMyInnerString.content = "new string in new child";

		// Check the number of events fired is correct (otherwise the assertions in the listeners might not have ran)
		assert.strictEqual(beforeCounter, 6);
		assert.strictEqual(afterCounter, 6);
	});

	it.only("tree is in correct state when events fire - primitive node deletions", () => {
		// TODO: once assignment to properties is implemented in EditableTree2, update this test to apply changes like
		//   root.myString = "new string";
		// instead of
		//   root.boxedMyString.content = "new string";

		const initialNumber = 20;
		const factory = new TypedTreeFactory({
			jsonValidator: typeboxValidator,
			forest: ForestType.Reference,
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: {
				myString: "initial string",
				myOptionalNumber: initialNumber,
				child: { myInnerString: "initial string in child" },
			},
			schema,
			subtype: "test",
		});

		const root = factory.create(new MockFluidDataStoreRuntime(), "the tree").root.content;

		let totalListenerCalls = 0;

		root.on("beforeChange", (event) => {
			assert.strictEqual(root.myOptionalNumber, initialNumber);
			totalListenerCalls++;
		});
		root.on("afterChange", (event) => {
			assert.strictEqual(root.myOptionalNumber, undefined);
			totalListenerCalls++;
		});
		root.boxedMyOptionalNumber.content = undefined;
		assert.strictEqual(totalListenerCalls, 2);
	});

	it.only("tree is in correct state when events fire - primitive node additions", () => {
		// TODO: once assignment to properties is implemented in EditableTree2, update this test to apply changes like
		//   root.myString = "new string";
		// instead of
		//   root.boxedMyString.content = "new string";

		const factory = new TypedTreeFactory({
			jsonValidator: typeboxValidator,
			forest: ForestType.Reference,
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				child: { myInnerString: "initial string in child" },
			},
			schema,
			subtype: "test",
		});

		const newNumber = 20;

		const root = factory.create(new MockFluidDataStoreRuntime(), "the tree").root.content;
		let totalListenerCalls = 0;

		root.on("beforeChange", (event) => {
			assert.strictEqual(root.myOptionalNumber, undefined);
			totalListenerCalls++;
		});
		root.on("afterChange", (event) => {
			assert.strictEqual(root.myOptionalNumber, newNumber);
			totalListenerCalls++;
		});
		root.boxedMyOptionalNumber.content = newNumber;
		assert.strictEqual(totalListenerCalls, 2);
	});

	it.only("tree is in correct state when events fire - primitive node replacements", () => {
		// TODO: once assignment to properties is implemented in EditableTree2, update this test to apply changes like
		//   root.myString = "new string";
		// instead of
		//   root.boxedMyString.content = "new string";

		const factory = new TypedTreeFactory({
			jsonValidator: typeboxValidator,
			forest: ForestType.Reference,
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				child: { myInnerString: "initial string in child" },
			},
			schema,
			subtype: "test",
		});

		const root = factory.create(new MockFluidDataStoreRuntime(), "the tree").root.content;
		let totalListenerCalls = 0;
		const newString = "John";

		root.on("beforeChange", (event) => {
			assert.strictEqual(root.myString, "initial string");
			totalListenerCalls++;
		});
		root.on("afterChange", (event) => {
			assert.strictEqual(root.myString, newString);
			totalListenerCalls++;
		});
		root.boxedMyString.content = newString;
		assert.strictEqual(totalListenerCalls, 2);
	});

	it.only("not emitted by nodes when they are replaced", () => {
		// TODO: once assignment to properties is implemented in EditableTree2, update this test to apply changes like
		//   root.myString = "new string";
		// instead of
		//   root.boxedMyString.content = "new string";

		const factory = new TypedTreeFactory({
			jsonValidator: typeboxValidator,
			forest: ForestType.Reference,
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: {
				myString: "initial string",
				myOptionalNumber: undefined,
				child: { myInnerString: "initial string in child" },
			},
			schema,
			subtype: "test",
		});

		const root = factory.create(new MockFluidDataStoreRuntime(), "the tree").root.content;

		let beforeCounter = 0;
		let afterCounter = 0;
		root.child.on("beforeChange", (event) => {
			beforeCounter++;
		});
		root.child.on("afterChange", (event) => {
			afterCounter++;
		});
		root.boxedChild.content = { myInnerString: "initial string in new child" };

		// Events shouldn't have fired on the original myString node
		assert.strictEqual(beforeCounter, 0);
		assert.strictEqual(afterCounter, 0);
	});
});

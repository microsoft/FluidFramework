/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";

import { FieldKinds, SchemaBuilder, typeNameSymbol } from "../../../feature-libraries";
// import { TreeContent } from "../../../shared-tree";
// import { Context } from "../../../feature-libraries/editable-tree-2/context";
// import { IEditableForest } from "../../../core";
import { AllowedUpdateType } from "../../../core";
import { TypedTreeFactory } from "../../../typed-tree";
import { ForestType } from "../../../shared-tree";
import { typeboxValidator } from "../../../external-utilities";
import { leaf } from "../../..";
// import { getReadonlyContext } from "./utils";


describe("beforeChange/afterChange events", () => {

	it("editable-tree-2-end-to-end", () => {
		const builder = new SchemaBuilder("e2e");
		const schema = builder.intoDocumentSchema(SchemaBuilder.fieldRequired(leaf.number));
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

	it.only("fire the expected number of times", () => {
		const builder = new SchemaBuilder("test");
		const myNodeSchema = builder.structRecursive("myNode", {
			child: SchemaBuilder.fieldRecursive(FieldKinds.required, () => myNodeSchema),
			myString: SchemaBuilder.fieldRequired(leaf.string),
			myBoolean: SchemaBuilder.fieldRequired(leaf.boolean),
			myOptionalNumber: SchemaBuilder.fieldOptional(leaf.number),
		});
		const schema = builder.intoDocumentSchema(SchemaBuilder.fieldRequired(myNodeSchema));

		const factory = new TypedTreeFactory({
			jsonValidator: typeboxValidator,
			forest: ForestType.Reference,
			allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
			initialTree: { [typeNameSymbol]: "myNode", myString: "initialString", myBoolean: true, myOptionalNumber: 3 },
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
		root.myString = "newString";

		assert.strictEqual(rootBeforeChangeCount, 1);
		assert.strictEqual(rootAfterChangeCount, 1);

		// Add node where there was none before - child; should fire events on the root node.
		// This also lets us put listeners on it, otherwise get complaints that root.child might be undefined below.
		root.child = {
			myString: "initialStringInChild",
			myBoolean: true,
		};

		assert.strictEqual(rootBeforeChangeCount, 2);
		assert.strictEqual(rootAfterChangeCount, 2);

		root.child.on("beforeChange", (event) => {
			childBeforeChangeCount++;
		});
		root.child.on("afterChange", (event) => {
			childAfterChangeCount++;
		});

		assert.strictEqual(childBeforeChangeCount, 0);
		assert.strictEqual(childAfterChangeCount, 0);

		// Replace myString in child; should fire events on the child node and the root node.
		root.child.myString = "newStringInChild";

		assert.strictEqual(rootBeforeChangeCount, 3);
		assert.strictEqual(rootAfterChangeCount, 3);
		assert.strictEqual(childBeforeChangeCount, 1);
		assert.strictEqual(childAfterChangeCount, 1);

		// Replace the whole child; should fire events on the root node.
		root.child = {
			myString: "newStringInNewChild",
			myBoolean: false,
		};

		assert.strictEqual(rootBeforeChangeCount, 4);
		assert.strictEqual(rootAfterChangeCount, 4);
		// No events should have fired on the old address node.
		assert.strictEqual(childBeforeChangeCount, 1);
		assert.strictEqual(childAfterChangeCount, 1);

		// Replace myBoolean in new child node; should fire events on the root node (but not on the old child node)
		root.child.myBoolean = true;

		assert.strictEqual(rootBeforeChangeCount, 5);
		assert.strictEqual(rootAfterChangeCount, 5);
		assert.strictEqual(childBeforeChangeCount, 1);
		assert.strictEqual(childAfterChangeCount, 1);

		// Delete node - myOptionalNumber; should fire events on the root node
		delete root.myOptionalNumber;

		assert.strictEqual(rootBeforeChangeCount, 6);
		assert.strictEqual(rootAfterChangeCount, 6);
	});

	// it.only("fire in the expected order and always together", () => {
	// 	const tree = viewWithContent({ schema: fullSchemaData, initialTree: getPersonBasic() });
	// 	const person = tree.root as Tree;

	// 	let beforeCounter = 0;
	// 	let afterCounter = 0;

	// 	person[on]("beforeChange", (event) => {
	// 		beforeCounter++;
	// 		assert.strictEqual(afterCounter, beforeCounter - 1, "beforeChange fired out of order");
	// 	});
	// 	person[on]("afterChange", (event) => {
	// 		afterCounter++;
	// 		assert.strictEqual(afterCounter, beforeCounter, "afterChange fired out of order");
	// 	});

	// 	// Make updates of different kinds to the tree
	// 	// Replace an existing node
	// 	person.age = brand<Int32>(32);
	// 	// Add a node where there was none before
	// 	person.address = {
	// 		zip: "99999",
	// 		street: "foo",
	// 		phones: [12345],
	// 	} as unknown as Address; // TODO: fix up these strong types to reflect unwrapping
	// 	// Delete a node
	// 	delete person.age;
	// 	// Other miscelleaneous updates
	// 	person.address.zip = brand<Int32>(12345);
	// 	person.address = {
	// 		zip: "99999",
	// 		street: "foo",
	// 		phones: [12345],
	// 	} as unknown as Address; // TODO: fix up these strong types to reflect unwrapping
	// 	person.address.zip = brand<Int32>(23456);

	// 	// Check the number of events fired is correct (otherwise the assertions in the listeners might not have ran)
	// 	assert.strictEqual(beforeCounter, 6);
	// 	assert.strictEqual(afterCounter, 6);
	// });

	// it.only("tree is in correct state when events fire - primitive node deletions", () => {
	// 	const tree = viewWithContent({ schema: fullSchemaData, initialTree: getPersonBasic() });
	// 	const person = tree.root as Tree;
	// 	const initialAge = person.age;
	// 	let totalListenerCalls = 0;

	// 	person[on]("beforeChange", (event) => {
	// 		// PROBLEM: the local 'person' object did have its 'age' property updated already.
	// 		assert.strictEqual(person.age, initialAge);
	// 		totalListenerCalls++;
	// 	});
	// 	person[on]("afterChange", (event) => {
	// 		assert.strictEqual(person.age, undefined);
	// 		totalListenerCalls++;
	// 	});
	// 	delete person.age;
	// 	assert.strictEqual(totalListenerCalls, 2);
	// });

	// it.only("tree is in correct state when events fire - primitive node additions", () => {
	// 	const tree = viewWithContent({ schema: fullSchemaData, initialTree: getPersonBasic() });
	// 	const person = tree.root as Tree;
	// 	const newAdultValue = brand<Bool>(true);
	// 	let totalListenerCalls = 0;

	// 	person[on]("beforeChange", (event) => {
	// 		assert.strictEqual(person.adult, undefined);
	// 		totalListenerCalls++;
	// 	});
	// 	person[on]("afterChange", (event) => {
	// 		assert.strictEqual(person.adult, newAdultValue);
	// 		totalListenerCalls++;
	// 	});
	// 	person.adult = newAdultValue;
	// 	assert.strictEqual(totalListenerCalls, 2);
	// });

	// it.only("tree is in correct state when events fire - primitive node replacements", () => {
	// 	const tree = viewWithContent({ schema: fullSchemaData, initialTree: getPersonBasic() });
	// 	const person = tree.root as Tree;
	// 	const newNameValue = "John";
	// 	let totalListenerCalls = 0;

	// 	person[on]("beforeChange", (event) => {
	// 		assert.strictEqual(person.name, "Adam");
	// 		totalListenerCalls++;
	// 	});
	// 	person[on]("afterChange", (event) => {
	// 		assert.strictEqual(person.name, newNameValue);
	// 		totalListenerCalls++;
	// 	});
	// 	person.name = newNameValue;
	// 	assert.strictEqual(totalListenerCalls, 2);
	// });

	// it.skip("not emitted by leaf nodes when they are replaced", () => {
	// 	const tree = viewWithContent({ schema: fullSchemaData, initialTree: getPerson() });
	// 	const person = tree.root as Tree;
	// 	person.age = brand<Int32>(32); // Explicitly update age so we can attach listeners to it.
	// 	let beforeCounter = 0;
	// 	let afterCounter = 0;
	// 	// QUESTION
	// 	// Are we already not allowing leaf nodes to have listeners?
	// 	// `person.age[on]` doesn't work (error: "Element implicitly has an 'any' type because expression of type 'unique
	// 	// symbol' can't be used to index type 'number | EditableTree'")
	// 	// And with the cast to EditableTree: TypeError: person.age[feature_libraries_1.on] is not a function
	// 	(person.age as Tree)[on]("beforeChange", (event) => {
	// 		beforeCounter++;
	// 	});
	// 	(person.age as Tree)[on]("afterChange", (event) => {
	// 		afterCounter++;
	// 	});
	// 	person.age = brand<Int32>(33);
	// 	// Events shouldn't have fired on the original age node
	// 	assert.strictEqual(beforeCounter, 0);
	// 	assert.strictEqual(afterCounter, 0);
	// });
});

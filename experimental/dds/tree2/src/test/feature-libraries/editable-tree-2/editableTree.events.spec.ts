/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// import { strict as assert } from "assert";

// import { viewWithContent } from "../../utils";
// import { brand } from "../../../util";
// import { Tree, on } from "../../../feature-libraries";
// // import { TreeContent } from "../../../shared-tree";
// // import { Context } from "../../../feature-libraries/editable-tree-2/context";
// // import { IEditableForest } from "../../../core";
// import { fullSchemaData, getPerson, Int32, Address, Bool, Person } from "./mockData";
// // import { getReadonlyContext } from "./utils";

// function getPersonBasic(): Person {
// 	return {
// 		name: "Adam",
// 		age: brand<Int32>(35),
// 		adult: brand<Bool>(true),
// 	} as unknown as Person; // TODO: fix up these strong types to reflect unwrapping
// }

// // /**
// //  * Initializes a test tree, context, and cursor, and moves the cursor to the tree's root.
// //  *
// //  * @returns The initialized context and cursor.
// //  */
// // function initializeTreeWithContent<Kind extends FieldKind, Types extends AllowedTypes>(
// // 	treeContent: TreeContent,
// // ): {
// // 	forest: IEditableForest,
// // 	context: Context;
// // } {
// // 	const forest = forestWithContent(treeContent);
// // 	const context = getReadonlyContext(forest, treeContent.schema);

// // 	return {
// // 		forest,
// // 		context
// // 	};
// // }

// describe("beforeChange/afterChange events", () => {
// 	it.only("fire the expected number of times", () => {
// 		// const builder = new SchemaBuilder("test");
// 		// const booleanLeafSchema = builder.leaf("bool", ValueSchema.Boolean);
// 		// const stringLeafSchema = builder.leaf("string", ValueSchema.String);
// 		// const numberLeafSchema = builder.leaf("number", ValueSchema.Number);
// 		// const leafSchema = builder.struct("struct", {
// 		// 	myString: SchemaBuilder.fieldValue(stringLeafSchema),
// 		// 	myBoolean: SchemaBuilder.fieldValue(booleanLeafSchema),
// 		// 	myOptionalNumber: SchemaBuilder.fieldOptional(numberLeafSchema),
// 		// });
// 		// const rootSchema = SchemaBuilder.fieldOptional(leafSchema);
// 		// const schema = builder.intoDocumentSchema(rootSchema);

// 		// const { forest, context } = initializeTreeWithContent({
// 		// 	schema,
// 		// 	initialTree: {
// 		// 		myString: "initialString",
// 		// 		myBoolean: brand<Bool>(true),
// 		// 	},
// 		// });

// 		// const root = context.root.parent as TreeNode;

// 		const tree = viewWithContent({ schema: fullSchemaData, initialTree: getPersonBasic() });
// 		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
// 		const root = tree.editableTree2(fullSchemaData).parent!;

// 		let beforeChangePersonCount = 0;
// 		let afterChangePersonCount = 0;
// 		let beforeChangeAddressCount = 0;
// 		let afterChangeAddressCount = 0;

// 		root.on("beforeChange", (event) => {
// 			beforeChangePersonCount++;
// 		});
// 		root.on("afterChange", (event) => {
// 			afterChangePersonCount++;
// 		});

// 		assert.strictEqual(beforeChangePersonCount, 0);
// 		assert.strictEqual(afterChangePersonCount, 0);

// 		// Replace existing node - myString; should fire events on the root node.
// 		root.myString = "newString";

// 		assert.strictEqual(beforeChangePersonCount, 1);
// 		assert.strictEqual(afterChangePersonCount, 1);

// 		// Add node where there was none before - myOptionalNumber; should fire events on the root node.
// 		// This also lets us put listeners on it, otherwise get complaints that root.myOptionalNumber might be undefined below.
// 		root.address = {
// 			zip: "99999",
// 			street: "foo",
// 			phones: [12345],
// 		} as unknown as Address; // TODO: fix up these strong types to reflect unwrapping

// 		assert.strictEqual(beforeChangePersonCount, 2);
// 		assert.strictEqual(afterChangePersonCount, 2);

// 		root.address[on]("beforeChange", (event) => {
// 			beforeChangeAddressCount++;
// 		});
// 		root.address[on]("afterChange", (event) => {
// 			afterChangeAddressCount++;
// 		});

// 		assert.strictEqual(beforeChangeAddressCount, 0);
// 		assert.strictEqual(afterChangeAddressCount, 0);

// 		// Replace zip in address; should fire events on the address node and the person node.
// 		root.address.zip = brand<Int32>(12345);

// 		assert.strictEqual(beforeChangePersonCount, 3);
// 		assert.strictEqual(afterChangePersonCount, 3);
// 		assert.strictEqual(beforeChangeAddressCount, 1);
// 		assert.strictEqual(afterChangeAddressCount, 1);

// 		// Replace the whole address; should fire events on the root node.
// 		root.address = {
// 			zip: "99999",
// 			street: "foo",
// 			phones: [12345],
// 		} as unknown as Address; // TODO: fix up these strong types to reflect unwrapping

// 		assert.strictEqual(beforeChangePersonCount, 4);
// 		assert.strictEqual(afterChangePersonCount, 4);
// 		// No events should have fired on the old address node.
// 		assert.strictEqual(beforeChangeAddressCount, 1);
// 		assert.strictEqual(afterChangeAddressCount, 1);

// 		// Replace zip in new address node; should fire events on the root node (but not on the old address node)
// 		root.address.zip = brand<Int32>(23456);

// 		assert.strictEqual(beforeChangePersonCount, 5);
// 		assert.strictEqual(afterChangePersonCount, 5);
// 		assert.strictEqual(beforeChangeAddressCount, 1);
// 		assert.strictEqual(afterChangeAddressCount, 1);

// 		// Delete node - age; should fire events on the root node
// 		delete root.age;

// 		assert.strictEqual(beforeChangePersonCount, 6);
// 		assert.strictEqual(afterChangePersonCount, 6);
// 	});

// 	it.only("fire in the expected order and always together", () => {
// 		const tree = viewWithContent({ schema: fullSchemaData, initialTree: getPersonBasic() });
// 		const person = tree.root as Tree;

// 		let beforeCounter = 0;
// 		let afterCounter = 0;

// 		person[on]("beforeChange", (event) => {
// 			beforeCounter++;
// 			assert.strictEqual(afterCounter, beforeCounter - 1, "beforeChange fired out of order");
// 		});
// 		person[on]("afterChange", (event) => {
// 			afterCounter++;
// 			assert.strictEqual(afterCounter, beforeCounter, "afterChange fired out of order");
// 		});

// 		// Make updates of different kinds to the tree
// 		// Replace an existing node
// 		person.age = brand<Int32>(32);
// 		// Add a node where there was none before
// 		person.address = {
// 			zip: "99999",
// 			street: "foo",
// 			phones: [12345],
// 		} as unknown as Address; // TODO: fix up these strong types to reflect unwrapping
// 		// Delete a node
// 		delete person.age;
// 		// Other miscelleaneous updates
// 		person.address.zip = brand<Int32>(12345);
// 		person.address = {
// 			zip: "99999",
// 			street: "foo",
// 			phones: [12345],
// 		} as unknown as Address; // TODO: fix up these strong types to reflect unwrapping
// 		person.address.zip = brand<Int32>(23456);

// 		// Check the number of events fired is correct (otherwise the assertions in the listeners might not have ran)
// 		assert.strictEqual(beforeCounter, 6);
// 		assert.strictEqual(afterCounter, 6);
// 	});

// 	it.only("tree is in correct state when events fire - primitive node deletions", () => {
// 		const tree = viewWithContent({ schema: fullSchemaData, initialTree: getPersonBasic() });
// 		const person = tree.root as Tree;
// 		const initialAge = person.age;
// 		let totalListenerCalls = 0;

// 		person[on]("beforeChange", (event) => {
// 			// PROBLEM: the local 'person' object did have its 'age' property updated already.
// 			assert.strictEqual(person.age, initialAge);
// 			totalListenerCalls++;
// 		});
// 		person[on]("afterChange", (event) => {
// 			assert.strictEqual(person.age, undefined);
// 			totalListenerCalls++;
// 		});
// 		delete person.age;
// 		assert.strictEqual(totalListenerCalls, 2);
// 	});

// 	it.only("tree is in correct state when events fire - primitive node additions", () => {
// 		const tree = viewWithContent({ schema: fullSchemaData, initialTree: getPersonBasic() });
// 		const person = tree.root as Tree;
// 		const newAdultValue = brand<Bool>(true);
// 		let totalListenerCalls = 0;

// 		person[on]("beforeChange", (event) => {
// 			assert.strictEqual(person.adult, undefined);
// 			totalListenerCalls++;
// 		});
// 		person[on]("afterChange", (event) => {
// 			assert.strictEqual(person.adult, newAdultValue);
// 			totalListenerCalls++;
// 		});
// 		person.adult = newAdultValue;
// 		assert.strictEqual(totalListenerCalls, 2);
// 	});

// 	it.only("tree is in correct state when events fire - primitive node replacements", () => {
// 		const tree = viewWithContent({ schema: fullSchemaData, initialTree: getPersonBasic() });
// 		const person = tree.root as Tree;
// 		const newNameValue = "John";
// 		let totalListenerCalls = 0;

// 		person[on]("beforeChange", (event) => {
// 			assert.strictEqual(person.name, "Adam");
// 			totalListenerCalls++;
// 		});
// 		person[on]("afterChange", (event) => {
// 			assert.strictEqual(person.name, newNameValue);
// 			totalListenerCalls++;
// 		});
// 		person.name = newNameValue;
// 		assert.strictEqual(totalListenerCalls, 2);
// 	});

// 	it.skip("not emitted by leaf nodes when they are replaced", () => {
// 		const tree = viewWithContent({ schema: fullSchemaData, initialTree: getPerson() });
// 		const person = tree.root as Tree;
// 		person.age = brand<Int32>(32); // Explicitly update age so we can attach listeners to it.
// 		let beforeCounter = 0;
// 		let afterCounter = 0;
// 		// QUESTION
// 		// Are we already not allowing leaf nodes to have listeners?
// 		// `person.age[on]` doesn't work (error: "Element implicitly has an 'any' type because expression of type 'unique
// 		// symbol' can't be used to index type 'number | EditableTree'")
// 		// And with the cast to EditableTree: TypeError: person.age[feature_libraries_1.on] is not a function
// 		(person.age as Tree)[on]("beforeChange", (event) => {
// 			beforeCounter++;
// 		});
// 		(person.age as Tree)[on]("afterChange", (event) => {
// 			afterCounter++;
// 		});
// 		person.age = brand<Int32>(33);
// 		// Events shouldn't have fired on the original age node
// 		assert.strictEqual(beforeCounter, 0);
// 		assert.strictEqual(afterCounter, 0);
// 	});
// });

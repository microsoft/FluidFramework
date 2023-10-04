/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";

import { viewWithContent } from "../../utils";
import {
	FieldKey,
	rootFieldKey,
	UpPath,
	AnchorEvents,
	AnchorNode,
	IEditableForest,
	PathVisitor,
	ProtoNodes,
	DetachedRangeUpPath,
	DetachedPlaceUpPath,
	PlaceUpPath,
	RangeUpPath,
} from "../../../core";
import { brand } from "../../../util";
import {
	EditableTree,
	getField,
	jsonableTreeFromCursor,
	on,
	singleTextCursor,
} from "../../../feature-libraries";
import { IEmitter } from "../../../events";
import {
	fullSchemaData,
	personData,
	getReadonlyEditableTreeContext,
	setupForest,
	addressSchema,
	int32Schema,
	getPerson,
	Int32,
	Address,
} from "./mockData";

const fieldAddress: FieldKey = brand("address");

describe("editable-tree: event subscription", () => {
	it("consumes children changing events with correct args", () => {
		const { address, forest } = retrieveAddressNode();
		const log: UpPath[] = [];
		const unsubscribeChanging = address[on]("changing", (upPath: UpPath) => {
			log.push(upPath);
		});
		const { emitter, node } = accessEmitters(forest, [rootFieldKey, 0], [fieldAddress, 0]);
		emitter.emit("childrenChanging", node);
		unsubscribeChanging();
		emitter.emit("childrenChanging", node);
		assert.deepEqual(log, [node]);
	});

	it("consumes subtree changing events returning void, ie. no path visitor", () => {
		const { address, forest } = retrieveAddressNode();
		const log: UpPath[] = [];
		const unsubscribeChanging = address[on]("subtreeChanging", (upPath: UpPath) => {
			log.push(upPath);
		});
		const { emitter, node } = accessEmitters(forest, [rootFieldKey, 0], [fieldAddress, 0]);
		emitter.emit("subtreeChanging", node);
		unsubscribeChanging();
		emitter.emit("subtreeChanging", node);
		assert.deepEqual(log, [node]);
	});

	it("consumes subtree changing events returning path visitor", () => {
		const { address, forest } = retrieveAddressNode();
		const log: UpPath[] = [];
		const visitLog: UpPath[] = [];
		const { emitter, node } = accessEmitters(forest, [rootFieldKey, 0], [fieldAddress, 0]);
		const unsubscribeChanging = address[on]("subtreeChanging", (upPath: UpPath) => {
			log.push(upPath);
			const visitor: PathVisitor = {
				onDelete(path: UpPath, count: number): void {
					assert.equal(count, 11);
					assert.deepEqual(path, node);
					visitLog.push(path);
				},
				onInsert(path: UpPath, content: ProtoNodes): void {
					const jsonable = content.map(jsonableTreeFromCursor);
					assert.deepEqual(jsonable, [
						{
							type: addressSchema.name,
							fields: {
								zip: [
									{
										type: int32Schema.name,
										value: 33428,
									},
								],
							},
						},
					]);
					assert.deepEqual(path, node);
					visitLog.push(path);
				},
				afterCreate(content: DetachedRangeUpPath): void {},
				beforeDestroy(content: DetachedRangeUpPath): void {},
				beforeAttach(source: DetachedRangeUpPath, destination: PlaceUpPath): void {},
				afterAttach(source: DetachedPlaceUpPath, destination: RangeUpPath): void {},
				beforeDetach(source: RangeUpPath, destination: DetachedPlaceUpPath): void {},
				afterDetach(source: PlaceUpPath, destination: DetachedRangeUpPath): void {},
				beforeReplace(
					newContent: DetachedRangeUpPath,
					oldContent: RangeUpPath,
					oldContentDestination: DetachedPlaceUpPath,
				): void {},
				afterReplace(
					newContentSource: DetachedPlaceUpPath,
					newContent: RangeUpPath,
					oldContent: DetachedRangeUpPath,
				): void {},
			};
			return visitor;
		});
		const results: (void | PathVisitor)[] = emitter.emitAndCollect("subtreeChanging", node);
		const visitors = results.filter((v): v is PathVisitor => v !== undefined);
		const insertContent = [
			singleTextCursor({
				type: addressSchema.name,
				fields: {
					zip: [
						{
							type: int32Schema.name,
							value: 33428,
						},
					],
				},
			}),
		];
		visitors.forEach((visitor) => {
			visitor.onDelete(node, 11);
			visitor.onInsert(node, insertContent);
		});
		unsubscribeChanging();
		emitter.emit("subtreeChanging", node);
		assert.deepEqual(log, [node]);
		assert.deepEqual(visitLog, [node, node]);
	});
});

describe("beforeChange/afterChange events", () => {
	it.only("fire the expected number of times", () => {
		const tree = viewWithContent({ schema: fullSchemaData, initialTree: getPerson() });
		const person = tree.root as EditableTree;

		let beforeChangePersonCount = 0;
		let afterChangePersonCount = 0;
		let beforeChangeAddressCount = 0;
		let afterChangeAddressCount = 0;

		person[on]("beforeChange", (event) => {
			beforeChangePersonCount++;
		});
		person[on]("afterChange", (event) => {
			afterChangePersonCount++;
		});

		assert.strictEqual(beforeChangePersonCount, 0);
		assert.strictEqual(afterChangePersonCount, 0);

		// Update age; should fire events on the person node.
		person.age = brand<Int32>(32);

		assert.strictEqual(beforeChangePersonCount, 1);
		assert.strictEqual(afterChangePersonCount, 1);

		// Update address; should fire events on the person node.
		// This also lets us put listeners on it, otherwise get complaints that person.address might be undefined below.
		person.address = {
			zip: "99999",
			street: "foo",
			phones: [12345],
		} as unknown as Address; // TODO: fix up these strong types to reflect unwrapping

		assert.strictEqual(beforeChangePersonCount, 2);
		assert.strictEqual(afterChangePersonCount, 2);

		person.address[on]("beforeChange", (event) => {
			beforeChangeAddressCount++;
		});
		person.address[on]("afterChange", (event) => {
			afterChangeAddressCount++;
		});

		assert.strictEqual(beforeChangeAddressCount, 0);
		assert.strictEqual(afterChangeAddressCount, 0);

		// Replace zip in address; should fire events on the address node and the person node.
		person.address.zip = brand<Int32>(12345);

		assert.strictEqual(beforeChangePersonCount, 3);
		assert.strictEqual(afterChangePersonCount, 3);
		assert.strictEqual(beforeChangeAddressCount, 1);
		assert.strictEqual(afterChangeAddressCount, 1);

		// Replace the whole address; should fire events on the person node.
		person.address = {
			zip: "99999",
			street: "foo",
			phones: [12345],
		} as unknown as Address; // TODO: fix up these strong types to reflect unwrapping

		assert.strictEqual(beforeChangePersonCount, 4);
		assert.strictEqual(afterChangePersonCount, 4);
		// No events should have fired on the old address node.
		assert.strictEqual(beforeChangeAddressCount, 1);
		assert.strictEqual(afterChangeAddressCount, 1);

		// Replace zip in new address node; should fire events on the person node (but not on the old address node)
		person.address.zip = brand<Int32>(23456);

		assert.strictEqual(beforeChangePersonCount, 5);
		assert.strictEqual(afterChangePersonCount, 5);
		assert.strictEqual(beforeChangeAddressCount, 1);
		assert.strictEqual(afterChangeAddressCount, 1);
	});

	it.only("fire in the expected order and always together", () => {
		const tree = viewWithContent({ schema: fullSchemaData, initialTree: getPerson() });
		const person = tree.root as EditableTree;

		let beforeCounter = 0;
		let afterCounter = 0;

		person[on]("beforeChange", (event) => {
			beforeCounter++;
			assert.strictEqual(afterCounter, beforeCounter - 1, "beforeChange fired out of order");
		});
		person[on]("afterChange", (event) => {
			afterCounter++;
			assert.strictEqual(afterCounter, beforeCounter, "afterChange fired out of order");
		});

		// Make updates to the tree
		person.age = brand<Int32>(32);
		person.address = {
			zip: "99999",
			street: "foo",
			phones: [12345],
		} as unknown as Address; // TODO: fix up these strong types to reflect unwrapping
		person.address.zip = brand<Int32>(12345);
		person.address = {
			zip: "99999",
			street: "foo",
			phones: [12345],
		} as unknown as Address; // TODO: fix up these strong types to reflect unwrapping
		person.address.zip = brand<Int32>(23456);

		// Check the number of events fired is correct (otherwise the assertions in the listeners might not have ran)
		assert.strictEqual(beforeCounter, 5);
		assert.strictEqual(afterCounter, 5);
	});

	it.skip("not emitted by leaf nodes when they are replaced", () => {
		const tree = viewWithContent({ schema: fullSchemaData, initialTree: getPerson() });
		const person = tree.root as EditableTree;
		person.age = brand<Int32>(32); // Explicitly update age so we can attach listeners to it.
		let beforeCounter = 0;
		let afterCounter = 0;
		// QUESTION
		// Are we already not allowing leaf nodes to have listeners?
		// `person.age[on]` doesn't work (error: "Element implicitly has an 'any' type because expression of type 'unique
		// symbol' can't be used to index type 'number | EditableTree'")
		// And with the cast to EditableTree: TypeError: person.age[feature_libraries_1.on] is not a function
		(person.age as EditableTree)[on]("beforeChange", (event) => {
			beforeCounter++;
		});
		(person.age as EditableTree)[on]("afterChange", (event) => {
			afterCounter++;
		});
		person.age = brand<Int32>(33);
		// Events shouldn't have fired on the original age node
		assert.strictEqual(beforeCounter, 0);
		assert.strictEqual(afterCounter, 0);
	});
});

interface PathNode extends AnchorNode {
	events: IEmitter<AnchorEvents>;
}

type PathStep = [FieldKey, number];

function makePath(...steps: [PathStep, ...PathStep[]]): UpPath {
	assert(steps.length > 0, "Path cannot be empty");
	return steps.reduce(
		(path: UpPath | undefined, step: PathStep) => ({
			parent: path,
			parentField: step[0],
			parentIndex: step[1],
		}),
		undefined,
	) as UpPath;
}

function accessEmitters(forest: IEditableForest, ...steps: [PathStep, ...PathStep[]]) {
	const upPath = makePath(...steps);
	const anchor = forest.anchors.track(upPath);
	const node = forest.anchors.locate(anchor) ?? assert.fail();
	const pathNode = node as PathNode;
	const emitter: IEmitter<AnchorEvents> = pathNode.events;
	return { emitter, node };
}

function retrieveAddressNode() {
	const forest = setupForest(fullSchemaData, personData);
	const context = getReadonlyEditableTreeContext(forest, fullSchemaData);
	const root = context.root.getNode(0);
	const address = root[getField](fieldAddress).getNode(0);
	return { address, forest };
}

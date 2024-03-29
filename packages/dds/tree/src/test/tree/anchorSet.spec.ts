/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	Anchor,
	AnchorNode,
	AnchorSet,
	DeltaFieldChanges,
	DeltaFieldMap,
	DeltaMark,
	DeltaVisitor,
	DetachedField,
	DetachedPlaceUpPath,
	DetachedRangeUpPath,
	FieldKey,
	FieldUpPath,
	JsonableTree,
	PathVisitor,
	PlaceUpPath,
	ProtoNodes,
	RangeUpPath,
	UpPath,
	anchorSlot,
	clonePath,
	getDetachedFieldContainingPath,
	keyAsDetachedField,
	rootFieldKey,
} from "../../core/index.js";
import { leaf } from "../../domains/index.js";
import { cursorForJsonableTreeNode } from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
import { announceTestDelta, applyTestDelta, expectEqualPaths } from "../utils.js";

const fieldFoo: FieldKey = brand("foo");
const fieldBar: FieldKey = brand("bar");
const fieldBaz: FieldKey = brand("baz");
const detachedField: FieldKey = brand("detached");
const node: JsonableTree = { type: brand("A"), value: "X" };
const detachId = { minor: 42 };
const buildId = { minor: 43 };

const path1 = makePath([fieldFoo, 5], [fieldBar, 4]);
const path2 = makePath([fieldFoo, 3], [fieldBaz, 2]);
const path3 = makePath([fieldFoo, 4]);
const path4 = makePath([fieldFoo, 5]);

describe("AnchorSet", () => {
	it("preserves paths", () => {
		const [anchors, anchor1, anchor2, anchor3] = setup();
		checkEquality(anchors.locate(anchor1), path1);
		checkEquality(anchors.locate(anchor2), path2);
		checkEquality(anchors.locate(anchor3), path3);
	});

	it("can move within field", () => {
		const anchors = new AnchorSet();
		const anchor0 = anchors.track(makePath([rootFieldKey, 0]));
		const anchor1 = anchors.track(makePath([rootFieldKey, 1]));
		const anchor2 = anchors.track(makePath([rootFieldKey, 2]));
		const anchor3 = anchors.track(makePath([rootFieldKey, 3]));

		// start with 0123 then move 1 so the order is 0213

		const moveId = { minor: 1 };
		const moveOut: DeltaMark = {
			count: 1,
			detach: moveId,
		};

		const moveIn: DeltaMark = {
			count: 1,
			attach: moveId,
		};

		const delta = new Map([
			[rootFieldKey, { local: [{ count: 1 }, moveOut, { count: 1 }, moveIn] }],
		]);
		announceTestDelta(delta, anchors);
		checkEquality(anchors.locate(anchor0), makePath([rootFieldKey, 0]));
		checkEquality(anchors.locate(anchor1), makePath([rootFieldKey, 2]));
		checkEquality(anchors.locate(anchor2), makePath([rootFieldKey, 1]));
		checkEquality(anchors.locate(anchor3), makePath([rootFieldKey, 3]));
	});

	it("can rebase over insert", () => {
		const [anchors, anchor1, anchor2, anchor3] = setup();

		const trees = [node, node].map(cursorForJsonableTreeNode);
		const fieldChanges: DeltaFieldChanges = {
			local: [{ count: 4 }, { count: 2, attach: buildId }],
		};
		announceTestDelta(
			makeFieldDelta(fieldChanges, makeFieldPath(fieldFoo)),
			anchors,
			undefined,
			[{ id: buildId, trees }],
		);

		checkEquality(anchors.locate(anchor1), makePath([fieldFoo, 7], [fieldBar, 4]));
		checkEquality(anchors.locate(anchor2), makePath([fieldFoo, 3], [fieldBaz, 2]));
		checkEquality(anchors.locate(anchor3), makePath([fieldFoo, 6]));
	});

	it("can rebase over destroy", () => {
		const [anchors, anchor1, anchor2, anchor3] = setup();
		withVisitor(anchors, (v) => {
			v.enterField(fieldFoo);
			v.detach({ start: 4, end: 5 }, detachedField);
			v.exitField(fieldFoo);
			v.destroy(detachedField, 1);
		});

		checkEquality(anchors.locate(anchor1), makePath([fieldFoo, 4], [fieldBar, 4]));
		checkEquality(anchors.locate(anchor2), path2);
		assert.equal(anchors.locate(anchor3), undefined);
		assert.doesNotThrow(() => anchors.forget(anchor3));
		assert.throws(() => anchors.locate(anchor3));
	});

	it("can rebase over detach", () => {
		const [anchors, anchor1, anchor2, anchor3] = setup();
		const detachMark = {
			count: 1,
			detach: detachId,
		};

		announceTestDelta(makeDelta(detachMark, makePath([fieldFoo, 4])), anchors);
		checkEquality(anchors.locate(anchor1), makePath([fieldFoo, 4], [fieldBar, 4]));
		checkEquality(anchors.locate(anchor2), path2);
		checkRemoved(anchors.locate(anchor3));
		assert.doesNotThrow(() => anchors.forget(anchor3));
		assert.throws(() => anchors.locate(anchor3));
	});

	it("can rebase over delete of parent node", () => {
		const [anchors, anchor1, anchor2, anchor3, anchor4] = setup();

		withVisitor(anchors, (v) => {
			v.enterField(fieldFoo);
			v.detach({ start: 5, end: 6 }, detachedField);
			v.exitField(fieldFoo);
			v.destroy(detachedField, 1);
		});

		assert.equal(anchors.locate(anchor4), undefined);
		assert.equal(anchors.locate(anchor1), undefined);
		assert.doesNotThrow(() => anchors.forget(anchor4));
		assert.doesNotThrow(() => anchors.forget(anchor1));
		checkEquality(anchors.locate(anchor2), path2);
		checkEquality(anchors.locate(anchor3), path3);
		assert.throws(() => anchors.locate(anchor4));
		assert.throws(() => anchors.locate(anchor1));

		checkEquality(anchors.locate(anchor2), path2);
		withVisitor(anchors, (v) => {
			v.enterField(fieldFoo);
			v.detach({ start: 3, end: 4 }, detachedField);
			v.exitField(fieldFoo);
			v.destroy(detachedField, 1);
		});
		checkEquality(anchors.locate(anchor2), undefined);
		assert.doesNotThrow(() => anchors.forget(anchor2));
		assert.throws(() => anchors.locate(anchor2));

		// The index of anchor3 has changed from 4 to 3 because of the deletion of the node at index 3.
		checkEquality(anchors.locate(anchor3), makePath([fieldFoo, 3]));
		withVisitor(anchors, (v) => {
			v.enterField(fieldFoo);
			v.detach({ start: 3, end: 4 }, detachedField);
			v.exitField(fieldFoo);
			v.destroy(detachedField, 1);
		});
		checkEquality(anchors.locate(anchor3), undefined);
		assert.doesNotThrow(() => anchors.forget(anchor3));
		assert.throws(() => anchors.locate(anchor3));
	});

	it("can rebase over detach of parent node", () => {
		const [anchors, anchor1, anchor2, anchor3, anchor4] = setup();
		const detachMark = {
			count: 1,
			detach: detachId,
		};

		announceTestDelta(makeDelta(detachMark, makePath([fieldFoo, 5])), anchors);
		checkRemoved(anchors.locate(anchor4));
		checkRemoved(anchors.locate(anchor1));
		assert.doesNotThrow(() => anchors.forget(anchor4));
		assert.doesNotThrow(() => anchors.forget(anchor1));
		checkEquality(anchors.locate(anchor2), path2);
		checkEquality(anchors.locate(anchor3), path3);
		assert.throws(() => anchors.locate(anchor4));
		assert.throws(() => anchors.locate(anchor1));

		checkEquality(anchors.locate(anchor2), path2);
		announceTestDelta(makeDelta(detachMark, makePath([fieldFoo, 3])), anchors);
		checkRemoved(anchors.locate(anchor2));
		assert.doesNotThrow(() => anchors.forget(anchor2));
		assert.throws(() => anchors.locate(anchor2));

		// The index of anchor3 has changed from 4 to 3 because of the deletion of the node at index 3.
		checkEquality(anchors.locate(anchor3), makePath([fieldFoo, 3]));
		announceTestDelta(makeDelta(detachMark, makePath([fieldFoo, 3])), anchors);
		checkRemoved(anchors.locate(anchor3));
		assert.doesNotThrow(() => anchors.forget(anchor3));
		assert.throws(() => anchors.locate(anchor3));
	});

	it("can rebase over move", () => {
		const [anchors, anchor1, anchor2, anchor3] = setup();
		const moveId = { minor: 1 };
		const moveOut: DeltaMark = {
			count: 1,
			detach: moveId,
		};

		const moveIn: DeltaMark = {
			count: 1,
			attach: moveId,
		};

		const modify: DeltaMark = {
			count: 1,
			fields: new Map([[fieldBar, { local: [{ count: 3 }, moveIn] }]]),
		};

		const delta = new Map([
			[fieldFoo, { local: [{ count: 3 }, moveOut, { count: 1 }, modify] }],
		]);
		announceTestDelta(delta, anchors);
		checkEquality(anchors.locate(anchor1), makePath([fieldFoo, 4], [fieldBar, 5]));
		checkEquality(
			anchors.locate(anchor2),
			makePath([fieldFoo, 4], [fieldBar, 3], [fieldBaz, 2]),
		);
		checkEquality(anchors.locate(anchor3), makePath([fieldFoo, 3]));
	});

	describe("internalize path", () => {
		it("identity case", () => {
			const anchors = new AnchorSet();
			const path = makePath([fieldFoo, 1]);
			const pathLonger = makePath([fieldFoo, 1], [fieldBar, 5]);
			assert.equal(anchors.internalizePath(path), path);
			assert.equal(anchors.internalizePath(pathLonger), pathLonger);

			// Check that anchor nodes are not used if they are not relevant.
			const anchor0 = anchors.track(makePath([rootFieldKey, 0]));
			assert.equal(anchors.internalizePath(path), path);
			assert.equal(anchors.internalizePath(pathLonger), pathLonger);
		});

		it("does not reuse external PathNodes", () => {
			const anchors = new AnchorSet();
			const anchors2 = new AnchorSet();
			const anchor0 = anchors2.track(makePath([rootFieldKey, 0]));
			const path = anchors2.locate(anchor0) ?? assert.fail();
			const pathLonger: UpPath = {
				parent: path,
				parentField: fieldBar,
				parentIndex: 0,
			};

			const internalPath = anchors.internalizePath(path);
			const internalPathLonger = anchors.internalizePath(pathLonger);
			assert.notEqual(internalPath, path);
			assert.notEqual(internalPathLonger, pathLonger);
			assert.notEqual(internalPathLonger.parent, pathLonger.parent);
			expectEqualPaths(internalPath, path);
			expectEqualPaths(internalPathLonger, pathLonger);
		});

		it("use PathNodes", () => {
			const anchors = new AnchorSet();
			const anchor0 = anchors.track(makePath([rootFieldKey, 0]));
			const path = anchors.locate(anchor0) ?? assert.fail();
			const pathLonger: UpPath = {
				parent: path,
				parentField: fieldBar,
				parentIndex: 0,
			};

			const internalPath = anchors.internalizePath(path);
			const internalPathLonger = anchors.internalizePath(pathLonger);
			assert.equal(internalPath, path);
			assert.equal(internalPathLonger, pathLonger);

			const clonedPath = clonePath(path);
			const clonedPathLonger = clonePath(pathLonger);

			const internalClonedPath = anchors.internalizePath(clonedPath);
			const internalClonedPathLonger = anchors.internalizePath(clonedPathLonger);
			expectEqualPaths(internalClonedPath, path);
			expectEqualPaths(internalClonedPathLonger, pathLonger);
			assert.equal(internalClonedPath, internalPath);
			assert.equal(internalClonedPathLonger.parent, internalClonedPath);
		});
	});

	it("triggers childrenChanging, childrenChanged, treeChanging, subtreeChanging, and afterDestroy callbacks", () => {
		// AnchorSet does not guarantee event ordering within a batch so use UnorderedTestLogger.
		const log = new UnorderedTestLogger();
		const anchors = new AnchorSet();
		anchors.on("childrenChanging", log.logger("root childrenChange"));
		anchors.on("treeChanging", log.logger("root treeChange"));

		const detachMark: DeltaMark = {
			count: 1,
			detach: detachId,
		};

		log.expect([]);
		announceTestDelta(new Map([[rootFieldKey, { local: [detachMark] }]]), anchors);

		log.expect([
			["root childrenChange", 1],
			["root treeChange", 1],
		]);
		log.clear();

		const anchor0 = anchors.track(makePath([rootFieldKey, 0]));
		const node0 = anchors.locate(anchor0) ?? assert.fail();

		node0.on("childrenChanging", log.logger("childrenChanging"));
		node0.on("childrenChanged", log.logger("childrenChanged"));
		node0.on("subtreeChanging", log.logger("subtreeChange"));
		node0.on("afterDestroy", log.logger("afterDestroy"));

		log.expect([]);

		const insertMark: DeltaMark = {
			count: 1,
			attach: buildId,
		};
		const build = [
			{
				id: buildId,
				trees: [cursorForJsonableTreeNode({ type: leaf.string.name, value: "x" })],
			},
		];
		announceTestDelta(
			new Map([
				[
					rootFieldKey,
					{
						local: [detachMark, insertMark],
					},
				],
			]),
			anchors,
			undefined,
			build,
		);

		log.expect([
			["root childrenChange", 2],
			["root treeChange", 1],
		]);
		log.clear();

		const insertAtFoo5 = makeFieldDelta(
			{
				local: [{ count: 5 }, insertMark],
			},
			makeFieldPath(fieldFoo, [rootFieldKey, 0]),
		);
		announceTestDelta(insertAtFoo5, anchors, undefined, build);

		log.expect([["root treeChange", 1]]);
		log.clear();

		announceTestDelta(new Map([[rootFieldKey, { local: [detachMark] }]]), anchors);
		log.expect([
			["root childrenChange", 1],
			["root treeChange", 1],
		]);
	});

	it("triggers beforeChange and afterChange callbacks in the right order and always as a pair", () => {
		const detachMark: DeltaMark = {
			count: 1,
			detach: detachId,
		};
		const anchors = new AnchorSet();

		// Insert a node at the root to set up listeners on it
		const insertAtFoo3 = makeFieldDelta(
			{
				local: [{ count: 3 }, { count: 1, attach: buildId }],
			},
			makeFieldPath(fieldFoo, [rootFieldKey, 0]),
		);
		const build = [{ id: buildId, trees: [cursorForJsonableTreeNode(node)] }];
		announceTestDelta(insertAtFoo3, anchors, undefined, build);
		const anchor0 = anchors.track(makePath([rootFieldKey, 0]));
		const node0 = anchors.locate(anchor0) ?? assert.fail();

		let beforeCounter = 0;
		let afterCounter = 0;

		const unsubscribeBeforeChange = node0.on("beforeChange", (n: AnchorNode) => {
			beforeCounter++;
			assert.strictEqual(afterCounter, beforeCounter - 1, "beforeChange fired out of order");
		});
		const unsubscribeAfterChange = node0.on("afterChange", (n: AnchorNode) => {
			afterCounter++;
			assert.strictEqual(afterCounter, beforeCounter, "afterChange fired out of order");
		});

		// Test an insert delta
		const insertAtFoo4 = makeFieldDelta(
			{
				local: [{ count: 4 }, { count: 1, attach: buildId }],
			},
			makeFieldPath(fieldFoo, [rootFieldKey, 0]),
		);
		announceTestDelta(insertAtFoo4, anchors, undefined, build);
		assert.strictEqual(beforeCounter, 1);
		assert.strictEqual(afterCounter, 1);

		// Test a replace delta
		const replaceAtFoo5 = makeFieldDelta(
			{
				local: [{ count: 5 }, { count: 1, detach: { minor: 42 }, attach: buildId }],
			},
			makeFieldPath(fieldFoo, [rootFieldKey, 0]),
		);
		announceTestDelta(replaceAtFoo5, anchors, undefined, build);
		assert.strictEqual(beforeCounter, 2);
		assert.strictEqual(afterCounter, 2);

		// Test a detach delta
		announceTestDelta(
			makeDelta(detachMark, makePath([rootFieldKey, 0], [fieldFoo, 5])),
			anchors,
		);
		assert.strictEqual(beforeCounter, 3);
		assert.strictEqual(afterCounter, 3);

		// Test a move delta
		// NOTE: This is a special case where the beforeChange and afterChange callbacks are called twice;
		// once when detaching nodes from the source location, and once when attaching them at the target location.
		const moveOutMark: DeltaMark = {
			count: 1,
			detach: { minor: 1 },
		};
		const moveInMark: DeltaMark = {
			count: 1,
			attach: moveOutMark.detach,
		};
		const moveDelta = makeFieldDelta(
			{ local: [moveOutMark, { count: 1 }, moveInMark] },
			makeFieldPath(fieldFoo, [rootFieldKey, 0]),
		);
		announceTestDelta(moveDelta, anchors);
		assert.strictEqual(beforeCounter, 5);
		assert.strictEqual(afterCounter, 5);

		// Remove listeners and validate another delta doesn't trigger the listeners anymore
		unsubscribeBeforeChange();
		unsubscribeAfterChange();
		announceTestDelta(insertAtFoo4, anchors, undefined, build);
		assert.strictEqual(beforeCounter, 5);
		assert.strictEqual(afterCounter, 5);
	});

	it("arguments for beforeChange and afterChange events are the expected object", () => {
		const detachMark: DeltaMark = {
			count: 1,
			detach: detachId,
		};
		const anchors = new AnchorSet();

		// Insert a node at the root to set up listeners on it
		const insertAtFoo3 = makeFieldDelta(
			{
				local: [{ count: 3 }, { count: 1, attach: buildId }],
			},
			makeFieldPath(fieldFoo, [rootFieldKey, 0]),
		);
		const build = [{ id: buildId, trees: [cursorForJsonableTreeNode(node)] }];
		announceTestDelta(insertAtFoo3, anchors, undefined, build);
		const anchor0 = anchors.track(makePath([rootFieldKey, 0]));
		const node0 = anchors.locate(anchor0) ?? assert.fail();

		let beforeCounter = 0;
		let afterCounter = 0;

		node0.on("beforeChange", (n: AnchorNode) => {
			assert.strictEqual(node0, n); // This is the important bit in this test
			beforeCounter++;
		});
		node0.on("afterChange", (n: AnchorNode) => {
			assert.strictEqual(node0, n); // This is the important bit in this test
			afterCounter++;
		});

		// Test an insert delta
		const insertAtFoo4 = makeFieldDelta(
			{
				local: [{ count: 4 }, { count: 1, attach: buildId }],
			},
			makeFieldPath(fieldFoo, [rootFieldKey, 0]),
		);
		announceTestDelta(insertAtFoo4, anchors, undefined, build);

		// Test a replace delta
		const replaceAtFoo5 = makeFieldDelta(
			{
				local: [{ count: 5 }, { count: 1, detach: { minor: 42 }, attach: buildId }],
			},
			makeFieldPath(fieldFoo, [rootFieldKey, 0]),
		);
		announceTestDelta(replaceAtFoo5, anchors, undefined, build);

		// Test a detach delta
		announceTestDelta(
			makeDelta(detachMark, makePath([rootFieldKey, 0], [fieldFoo, 5])),
			anchors,
		);

		// Test a move delta
		// NOTE: This is a special case where the beforeChange and afterChange callbacks are called twice;
		// once when detaching nodes from the source location, and once when attaching them at the target location.
		const moveOutMark: DeltaMark = {
			count: 1,
			detach: { minor: 1 },
		};
		const moveInMark: DeltaMark = {
			count: 1,
			attach: moveOutMark.detach,
		};
		const moveDelta = makeFieldDelta(
			{ local: [moveOutMark, { count: 1 }, moveInMark] },
			makeFieldPath(fieldFoo, [rootFieldKey, 0]),
		);
		announceTestDelta(moveDelta, anchors);

		// Make sure the listeners were actually called
		assert.strictEqual(beforeCounter, 5);
		assert.strictEqual(afterCounter, 5);
	});

	it("triggers path visitor callbacks", () => {
		const build = [
			{
				id: buildId,
				trees: [cursorForJsonableTreeNode({ type: leaf.string.name, value: "x" })],
			},
		];
		const insertAtFoo4 = makeFieldDelta(
			{
				local: [{ count: 4 }, { count: 1, attach: buildId }],
			},
			makeFieldPath(fieldFoo, [rootFieldKey, 0]),
		);
		const detachMark: DeltaMark = {
			count: 1,
			detach: detachId,
		};
		const replaceMark: DeltaMark = {
			count: 1,
			attach: buildId,
			detach: { minor: 42 },
		};
		const replaceAtFoo5 = makeFieldDelta(
			{
				local: [{ count: 5 }, replaceMark],
			},
			makeFieldPath(fieldFoo, [rootFieldKey, 0]),
		);
		const log = new UnorderedTestLogger();
		const anchors = new AnchorSet();
		const trees = [cursorForJsonableTreeNode(node)];
		const fieldChanges: DeltaFieldChanges = {
			local: [{ count: 3 }, { count: 1, attach: buildId }],
		};
		announceTestDelta(
			makeFieldDelta(fieldChanges, makeFieldPath(fieldFoo, [rootFieldKey, 0])),
			anchors,
			undefined,
			[{ id: buildId, trees }],
		);
		const anchor0 = anchors.track(makePath([rootFieldKey, 0]));
		const node0 = anchors.locate(anchor0) ?? assert.fail();
		const pathVisitor: PathVisitor = {
			onRemove(path: UpPath, count: number): void {
				log.logger(
					`visitSubtreeChange.onRemove-${String(path.parentField)}-${
						path.parentIndex
					}-${count}`,
				)();
			},
			onInsert(path: UpPath, content: ProtoNodes): void {
				log.logger(
					`visitSubtreeChange.onInsert-${String(path.parentField)}-${path.parentIndex}`,
				)();
			},
			afterCreate(content: DetachedRangeUpPath): void {
				log.logger(`visitSubtreeChange.afterCreate-${rangeToString(content)}`)();
			},
			beforeReplace(
				newContent: DetachedRangeUpPath,
				oldContent: RangeUpPath,
				oldContentDestination: DetachedPlaceUpPath,
			): void {
				log.logger(
					`visitSubtreeChange.beforeReplace-old:${rangeToString(
						oldContent,
					)}-new:${rangeToString(newContent)}`,
				)();
			},

			afterReplace(
				newContentSource: DetachedPlaceUpPath,
				newContent: RangeUpPath,
				oldContent: DetachedRangeUpPath,
			): void {
				log.logger(
					`visitSubtreeChange.afterReplace-old:${rangeToString(
						oldContent,
					)}-new:${rangeToString(newContent)}`,
				)();
			},
			beforeDestroy(content: DetachedRangeUpPath): void {
				log.logger(`visitSubtreeChange.beforeDestroy-${rangeToString(content)}`)();
			},
			beforeAttach(source: DetachedRangeUpPath, destination: PlaceUpPath): void {
				log.logger(
					`visitSubtreeChange.beforeAttach-src:${rangeToString(
						source,
					)}-dst:${placeToString(destination)}`,
				)();
			},
			afterAttach(source: DetachedPlaceUpPath, destination: RangeUpPath): void {
				log.logger(
					`visitSubtreeChange.afterAttach-src:${placeToString(
						source,
					)}-dst:${rangeToString(destination)}`,
				)();
			},
			beforeDetach(source: RangeUpPath, destination: DetachedPlaceUpPath): void {
				log.logger(
					`visitSubtreeChange.beforeDetach-src:${rangeToString(
						source,
					)}-dst:${placeToString(destination)}`,
				)();
			},
			afterDetach(source: PlaceUpPath, destination: DetachedRangeUpPath): void {
				log.logger(
					`visitSubtreeChange.afterDetach-src:${placeToString(
						source,
					)}-dst:${rangeToString(destination)}`,
				)();
			},
		};
		const unsubscribePathVisitor = node0.on("subtreeChanging", (n: AnchorNode) => pathVisitor);
		announceTestDelta(insertAtFoo4, anchors, undefined, build);
		log.expect([
			["visitSubtreeChange.beforeAttach-src:Temp-0[0, 1]-dst:foo[4]", 1],
			["visitSubtreeChange.afterAttach-src:Temp-0[0]-dst:foo[4, 5]", 1],
		]);
		log.clear();
		announceTestDelta(replaceAtFoo5, anchors, undefined, build);
		log.expect([
			["visitSubtreeChange.beforeReplace-old:foo[5, 6]-new:Temp-0[0, 1]", 1],
			["visitSubtreeChange.afterReplace-old:Temp-1[0, 1]-new:foo[5, 6]", 1],
		]);
		log.clear();
		announceTestDelta(
			makeDelta(detachMark, makePath([rootFieldKey, 0], [fieldFoo, 5])),
			anchors,
		);
		log.expect([
			["visitSubtreeChange.beforeDetach-src:foo[5, 6]-dst:Temp-0[0]", 1],
			["visitSubtreeChange.afterDetach-src:foo[5]-dst:Temp-0[0, 1]", 1],
		]);
		log.clear();
		unsubscribePathVisitor();
		announceTestDelta(insertAtFoo4, anchors, undefined, build);
		log.expect([]);
	});

	// Simple scenario using just anchorSets to validate if cache implementation of the FlexTree.treeStatus api works.
	it("AnchorNode cache can be set and retrieved.", () => {
		const anchors = new AnchorSet();

		const anchor0 = anchors.track(makePath([rootFieldKey, 0]));
		const anchorNode0 = anchors.locate(anchor0);

		// Create and add dummy cache value to the anchorSlot.
		const detached = keyAsDetachedField(rootFieldKey);
		const cache = {
			generationNumber: anchors.generationNumber,
			detachedField: detached,
		};
		const detachedfieldSlot = anchorSlot<{
			generationNumber: number;
			detachedField: DetachedField;
		}>();
		anchorNode0?.slots.set(detachedfieldSlot, cache);

		// Checks that we can retrieve the cache that was set in anchorSlot.
		const fieldSlotCache = anchorNode0?.slots.get(detachedfieldSlot);
		assert.equal(fieldSlotCache?.generationNumber, anchors.generationNumber);
		assert.equal(fieldSlotCache, cache);

		// Applies a dummy delta to increment anchorSet generationNumber.
		applyTestDelta(new Map([]), anchors);

		// Check that the cache generationNumber is no longer matching anchorSet generationNumber.
		assert.notEqual(
			anchors.locate(anchor0)?.slots.get(detachedfieldSlot)?.generationNumber,
			anchors.generationNumber,
		);
	});
});

class UnorderedTestLogger {
	public readonly logEntries: Map<string, number> = new Map();
	public logger(name: string): () => void {
		return () => {
			this.logEntries.set(name, (this.logEntries.get(name) ?? 0) + 1);
		};
	}
	public expect(expected: [string, number][]) {
		const expectedMap = new Map(expected);
		assert.deepEqual(this.logEntries, expectedMap);
	}
	public clear(): void {
		this.logEntries.clear();
	}
}

function withVisitor(anchors: AnchorSet, action: (visitor: DeltaVisitor) => void) {
	const visitor = anchors.acquireVisitor();
	action(visitor);
	visitor.free();
}

function setup(): [AnchorSet, Anchor, Anchor, Anchor, Anchor] {
	const anchors = new AnchorSet();
	const anchor1 = anchors.track(path1);
	const anchor2 = anchors.track(path2);
	const anchor3 = anchors.track(path3);
	const anchor4 = anchors.track(path4);
	return [anchors, anchor1, anchor2, anchor3, anchor4];
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

function makeFieldPath(field: FieldKey, ...stepsToFieldParent: PathStep[]): FieldUpPath {
	if (stepsToFieldParent.length === 0) {
		return { parent: undefined, field };
	}
	const pathToParent = makePath(stepsToFieldParent[0], ...stepsToFieldParent.slice(1));
	return { parent: pathToParent, field };
}

function checkEquality(actual: UpPath | undefined, expected: UpPath | undefined) {
	assert.deepEqual(clonePath(actual), clonePath(expected));
}

function checkRemoved(path: UpPath | undefined, expected: FieldKey = brand("Temp-0")) {
	assert.notEqual(path, undefined);
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	assert.equal(getDetachedFieldContainingPath(path!), expected);
}

function makeDelta(mark: DeltaMark, path: UpPath): DeltaFieldMap {
	const fields: DeltaFieldMap = new Map([
		[path.parentField, { local: [{ count: path.parentIndex }, mark] }],
	]);
	if (path.parent === undefined) {
		return fields;
	}

	return makeDelta({ count: 1, fields }, path.parent);
}

function makeFieldDelta(changes: DeltaFieldChanges, path: FieldUpPath): DeltaFieldMap {
	const fields: DeltaFieldMap = new Map([[path.field, changes]]);
	if (path.parent === undefined) {
		return fields;
	}

	return makeDelta({ count: 1, fields }, path.parent);
}

function rangeToString(range: RangeUpPath | DetachedRangeUpPath): string {
	return `${range.field}[${range.start}, ${range.end}]`;
}
function placeToString(place: PlaceUpPath | DetachedPlaceUpPath): string {
	return `${place.field}[${place.index}]`;
}

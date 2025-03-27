/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type Anchor,
	AnchorSet,
	type DeltaDetachedNodeId,
	type DeltaFieldChanges,
	type DeltaFieldMap,
	type DeltaMark,
	type DeltaVisitor,
	type DetachedField,
	type FieldKey,
	type FieldUpPath,
	type INormalizedUpPath,
	type JsonableTree,
	type UpPath,
	anchorSlot,
	clonePath,
	getDetachedFieldContainingPath,
	isDetachedUpPath,
	keyAsDetachedField,
	makeDetachedFieldIndex,
	rootFieldKey,
} from "../../core/index.js";
import { brand } from "../../util/index.js";
import {
	applyTestDelta,
	chunkFromJsonableTrees,
	expectEqualPaths,
	testIdCompressor,
	testRevisionTagCodec,
} from "../utils.js";
import { stringSchema } from "../../simple-tree/index.js";

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

		const delta = new Map([[rootFieldKey, [{ count: 1 }, moveOut, { count: 1 }, moveIn]]]);
		applyTestDelta(delta, anchors);
		checkEquality(anchors.locate(anchor0), makePath([rootFieldKey, 0]));
		checkEquality(anchors.locate(anchor1), makePath([rootFieldKey, 2]));
		checkEquality(anchors.locate(anchor2), makePath([rootFieldKey, 1]));
		checkEquality(anchors.locate(anchor3), makePath([rootFieldKey, 3]));
	});

	it("can rebase over insert", () => {
		const [anchors, anchor1, anchor2, anchor3] = setup();

		const trees = chunkFromJsonableTrees([node, node]);
		const fieldChanges: DeltaFieldChanges = [{ count: 4 }, { count: 2, attach: buildId }];
		applyTestDelta(makeFieldDelta(fieldChanges, makeFieldPath(fieldFoo)), anchors, {
			build: [{ id: buildId, trees }],
		});

		checkEquality(anchors.locate(anchor1), makePath([fieldFoo, 7], [fieldBar, 4]));
		checkEquality(anchors.locate(anchor2), makePath([fieldFoo, 3], [fieldBaz, 2]));
		checkEquality(anchors.locate(anchor3), makePath([fieldFoo, 6]));
	});

	it("can rebase over destroy", () => {
		const [anchors, anchor1, anchor2, anchor3] = setup();
		withVisitor(anchors, (v) => {
			v.enterField(fieldFoo);
			v.detach({ start: 4, end: 5 }, detachedField, detachId);
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

		applyTestDelta(makeDelta(detachMark, makePath([fieldFoo, 4])), anchors);
		checkEquality(anchors.locate(anchor1), makePath([fieldFoo, 4], [fieldBar, 4]));
		checkEquality(anchors.locate(anchor2), path2);
		checkRemoved(anchors.locate(anchor3), detachId);
		assert.doesNotThrow(() => anchors.forget(anchor3));
		assert.throws(() => anchors.locate(anchor3));
	});

	it("can rebase over delete of parent node", () => {
		const [anchors, anchor1, anchor2, anchor3, anchor4] = setup();

		withVisitor(anchors, (v) => {
			v.enterField(fieldFoo);
			v.detach({ start: 5, end: 6 }, detachedField, detachId);
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
			v.detach({ start: 3, end: 4 }, detachedField, detachId);
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
			v.detach({ start: 3, end: 4 }, detachedField, detachId);
			v.exitField(fieldFoo);
			v.destroy(detachedField, 1);
		});
		checkEquality(anchors.locate(anchor3), undefined);
		assert.doesNotThrow(() => anchors.forget(anchor3));
		assert.throws(() => anchors.locate(anchor3));
	});

	it("can rebase over detach of parent node", () => {
		const [anchors, anchor1, anchor2, anchor3, anchor4] = setup();
		const detachId1 = { minor: 1 };
		const detachMark1 = {
			count: 1,
			detach: detachId1,
		};

		applyTestDelta(makeDelta(detachMark1, makePath([fieldFoo, 5])), anchors);
		checkRemoved(anchors.locate(anchor4), detachId1);
		checkRemoved(anchors.locate(anchor1), undefined);
		assert.doesNotThrow(() => anchors.forget(anchor4));
		assert.doesNotThrow(() => anchors.forget(anchor1));
		checkEquality(anchors.locate(anchor2), path2);
		checkEquality(anchors.locate(anchor3), path3);
		assert.throws(() => anchors.locate(anchor4));
		assert.throws(() => anchors.locate(anchor1));

		const detachId2 = { minor: 2 };
		const detachMark2 = {
			count: 1,
			detach: detachId2,
		};
		checkEquality(anchors.locate(anchor2), path2);
		applyTestDelta(makeDelta(detachMark2, makePath([fieldFoo, 3])), anchors);
		checkRemoved(anchors.locate(anchor2), undefined);
		assert.doesNotThrow(() => anchors.forget(anchor2));
		assert.throws(() => anchors.locate(anchor2));

		const detachId3 = { minor: 3 };
		const detachMark3 = {
			count: 1,
			detach: detachId3,
		};
		// The index of anchor3 has changed from 4 to 3 because of the deletion of the node at index 3.
		checkEquality(anchors.locate(anchor3), makePath([fieldFoo, 3]));
		applyTestDelta(makeDelta(detachMark3, makePath([fieldFoo, 3])), anchors);
		checkRemoved(anchors.locate(anchor3), detachId3);
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
			fields: new Map([[fieldBar, [{ count: 3 }, moveIn]]]),
		};

		const delta = new Map([[fieldFoo, [{ count: 3 }, moveOut, { count: 1 }, modify]]]);
		applyTestDelta(delta, anchors);
		checkEquality(anchors.locate(anchor1), makePath([fieldFoo, 4], [fieldBar, 5]));
		checkEquality(
			anchors.locate(anchor2),
			makePath([fieldFoo, 4], [fieldBar, 3], [fieldBaz, 2]),
		);
		checkEquality(anchors.locate(anchor3), makePath([fieldFoo, 3]));
	});

	it("can rebase over remove and restore", () => {
		const [anchors, anchor1, anchor2, anchor3, anchor4] = setup();
		const detachMark = {
			count: 1,
			detach: detachId,
		};
		const detachedFieldIndex = makeDetachedFieldIndex(
			"repair",
			testRevisionTagCodec,
			testIdCompressor,
		);

		applyTestDelta(makeDelta(detachMark, makePath([fieldFoo, 3])), anchors, {
			detachedFieldIndex,
		});
		checkEquality(anchors.locate(anchor1), makePath([fieldFoo, 4], [fieldBar, 4]));
		checkRemoved(anchors.locate(anchor2), undefined, brand("repair-0"));
		checkEquality(anchors.locate(anchor3), makePath([fieldFoo, 3]));
		checkEquality(anchors.locate(anchor4), makePath([fieldFoo, 4]));

		const restoreMark = {
			count: 1,
			attach: detachId,
		};

		applyTestDelta(makeDelta(restoreMark, makePath([fieldFoo, 3])), anchors, {
			detachedFieldIndex,
		});
		checkEquality(anchors.locate(anchor1), path1);
		checkEquality(anchors.locate(anchor2), path2);
		checkEquality(anchors.locate(anchor3), path3);
		checkEquality(anchors.locate(anchor4), path4);
	});

	it("can rebase over removal of multiple nodes and restore of single node", () => {
		const [anchors, anchor1, anchor2, anchor3, anchor4] = setup();
		const detachMark = {
			count: 3,
			detach: detachId,
		};
		const detachedFieldIndex = makeDetachedFieldIndex(
			"repair",
			testRevisionTagCodec,
			testIdCompressor,
		);

		applyTestDelta(makeDelta(detachMark, makePath([fieldFoo, 3])), anchors, {
			detachedFieldIndex,
		});
		checkRemoved(anchors.locate(anchor1), undefined, brand("repair-2"));
		checkRemoved(anchors.locate(anchor2), undefined, brand("repair-0"));
		checkRemoved(anchors.locate(anchor3), { minor: 43 }, brand("repair-1"));
		checkRemoved(anchors.locate(anchor4), { minor: 44 }, brand("repair-2"));

		const restoreMark = {
			count: 1,
			attach: { minor: 44 },
		};

		applyTestDelta(makeDelta(restoreMark, makePath([fieldFoo, 3])), anchors, {
			detachedFieldIndex,
		});
		checkEquality(anchors.locate(anchor1), makePath([fieldFoo, 3], [fieldBar, 4]));
		assert(isDetachedUpPath(anchors.locate(anchor1) as UpPath) === false);
		checkRemoved(anchors.locate(anchor2), undefined, brand("repair-0"));
		checkRemoved(anchors.locate(anchor3), { minor: 43 }, brand("repair-1"));
		checkEquality(anchors.locate(anchor4), makePath([fieldFoo, 3]));
		assert.doesNotThrow(() => anchors.forget(anchor2));
		assert.throws(() => anchors.locate(anchor2));
		assert.doesNotThrow(() => anchors.forget(anchor3));
		assert.throws(() => anchors.locate(anchor3));
	});

	it("visitor can descend in under anchors and detach all their remaining children", () => {
		const [anchors, anchor1, anchor2, anchor3, anchor4] = setup();

		// This leaves anchor1 with no refs. It is kelp alive by anchor4 which is below it.
		anchors.forget(anchor4);

		withVisitor(anchors, (v) => {
			v.enterField(fieldFoo);
			v.enterNode(5);
			v.enterField(fieldBar);
			// This moves anchor4 (the only anchor under anchor1) out from under anchor1.
			// If the visitor did not increase the ref count of anchor1 on its way down,
			// anchor1 will be disposed as part of this operation.
			v.detach({ start: 4, end: 5 }, detachedField, detachId);
			v.exitField(fieldBar);
			// If anchor1 is be disposed. This will throw.
			v.exitNode(5);
			v.exitField(fieldFoo);
		});

		checkRemoved(anchors.locate(anchor1), detachId, detachedField);
	});

	it("can detach multiple nodes", () => {
		const anchors = new AnchorSet();

		// This tests that detaching nodes [a, b, c, d, e] while there are anchors to b and e works
		const bPath = makePath([fieldFoo, 1]);
		const ePath = makePath([fieldFoo, 4]);
		const bAnchor = anchors.track(bPath);
		const eAnchor = anchors.track(ePath);

		withVisitor(anchors, (v) => {
			v.enterField(fieldFoo);
			v.detach({ start: 0, end: 5 }, detachedField, detachId);
			v.exitField(fieldFoo);
		});

		checkRemoved(anchors.locate(bAnchor), { minor: 43 }, detachedField);
		checkRemoved(anchors.locate(eAnchor), { minor: 46 }, detachedField);
	});

	it("does not retain detachedNodeIds when detached nodes are reattached", () => {
		const anchors = new AnchorSet();

		// This tests that detaching nodes [a, b, c, d, e] while there are anchors to b and e works
		// and that reattaching [a, b, c] while there is an anchor to b removes the detachedNodeId from b
		const bPath = makePath([fieldFoo, 1]);
		const ePath = makePath([fieldFoo, 4]);
		const bAnchor = anchors.track(bPath);
		const eAnchor = anchors.track(ePath);

		withVisitor(anchors, (v) => {
			v.enterField(fieldFoo);
			v.detach({ start: 0, end: 5 }, detachedField, detachId);
			v.attach(detachedField, 3, 0);
			v.exitField(fieldFoo);
		});

		assert(isDetachedUpPath(anchors.locate(bAnchor) as UpPath) === false);
		const bPathLookup = anchors.locate(bAnchor);
		const ePathLookup = anchors.locate(eAnchor);
		assert(bPathLookup !== undefined);
		assert(ePathLookup !== undefined);
		assert(isDetachedUpPath(bPathLookup) === false);
		assert(isDetachedUpPath(ePathLookup) === true);
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
		anchors.events.on("childrenChanging", log.logger("root childrenChange"));
		anchors.events.on("treeChanging", log.logger("root treeChange"));

		const detachMark: DeltaMark = {
			count: 1,
			detach: detachId,
		};

		log.expect([]);
		applyTestDelta(new Map([[rootFieldKey, [detachMark]]]), anchors);

		log.expect([
			["root childrenChange", 1],
			["root treeChange", 1],
		]);
		log.clear();

		const anchor0 = anchors.track(makePath([rootFieldKey, 0]));
		const node0 = anchors.locate(anchor0) ?? assert.fail();

		node0.events.on("childrenChanging", log.logger("childrenChanging"));
		node0.events.on("childrenChanged", log.logger("childrenChanged"));
		node0.events.on("subtreeChanging", log.logger("subtreeChange"));
		node0.events.on("afterDestroy", log.logger("afterDestroy"));

		log.expect([]);

		const insertMark: DeltaMark = {
			count: 1,
			attach: buildId,
		};
		const build = [
			{
				id: buildId,
				trees: chunkFromJsonableTrees([{ type: brand(stringSchema.identifier), value: "x" }]),
			},
		];
		applyTestDelta(new Map([[rootFieldKey, [detachMark, insertMark]]]), anchors, { build });

		log.expect([
			["root childrenChange", 2],
			["root treeChange", 1],
		]);
		log.clear();

		const insertAtFoo5 = makeFieldDelta(
			[{ count: 5 }, insertMark],
			makeFieldPath(fieldFoo, [rootFieldKey, 0]),
		);
		applyTestDelta(insertAtFoo5, anchors, { build });

		log.expect([["root treeChange", 1]]);
		log.clear();

		applyTestDelta(new Map([[rootFieldKey, [detachMark]]]), anchors);
		log.expect([
			["root childrenChange", 1],
			["root treeChange", 1],
		]);
	});

	it("childrenChangedAfterBatch event includes the changed fields", () => {
		const fieldOne: FieldKey = brand("one");
		const fieldTwo: FieldKey = brand("two");
		const fieldThree: FieldKey = brand("three");

		const anchors = new AnchorSet();

		const anchor0 = anchors.track(makePath([rootFieldKey, 0]));
		const node0 = anchors.locate(anchor0) ?? assert.fail();

		const expectedChangedFields = new Set<FieldKey>([fieldOne, fieldTwo, fieldThree]);
		let listenerFired = false;
		node0.events.on("childrenChangedAfterBatch", ({ changedFields }) => {
			// This is the main validation of this test
			assert.deepEqual(changedFields, expectedChangedFields);
			listenerFired = true;
		});

		// Try to test all cases of changes happening on a delta visitor: attaches, detaches, replaces
		withVisitor(anchors, (v) => {
			v.enterField(rootFieldKey);
			v.enterNode(0);
			v.enterField(fieldOne);
			v.detach({ start: 0, end: 1 }, brand("fakeDetachDestination"), detachId);
			v.exitField(fieldOne);
			v.enterField(fieldTwo);
			v.attach(brand("fakeAttachSource"), 1, 0);
			v.exitField(fieldTwo);
			v.enterField(fieldThree);
			v.replace(
				brand("fakeReplaceSource"),
				{ start: 0, end: 1 },
				brand("fakeReplaceDestination"),
				detachId,
			);
			v.exitField(fieldThree);
			v.exitNode(0);
			v.exitField(rootFieldKey);
		});

		// Make sure the listener actually fired and validated the changed fields.
		assert.equal(listenerFired, true);
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
	public expect(expected: [string, number][]): void {
		const expectedMap = new Map(expected);
		assert.deepEqual(this.logEntries, expectedMap);
	}
	public clear(): void {
		this.logEntries.clear();
	}
}

function withVisitor(anchors: AnchorSet, action: (visitor: DeltaVisitor) => void): void {
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

function checkEquality(actual: UpPath | undefined, expected: UpPath | undefined): void {
	assert.deepEqual(clonePath(actual), clonePath(expected));
}

function checkRemoved(
	path: INormalizedUpPath | undefined,
	expectedDetachedNodeId: DeltaDetachedNodeId | undefined,
	expected: FieldKey = brand("Temp-0"),
): void {
	assert.notEqual(path, undefined);
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	assert.equal(getDetachedFieldContainingPath(path!), expected);
	assert.deepEqual(
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		path!.detachedNodeId,
		expectedDetachedNodeId,
	);
}

function makeDelta(mark: DeltaMark, path: UpPath): DeltaFieldMap {
	const fields: DeltaFieldMap = new Map([
		[path.parentField, [{ count: path.parentIndex }, mark]],
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

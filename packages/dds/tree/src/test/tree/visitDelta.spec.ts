/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type DeltaDetachedNodeChanges,
	type DeltaDetachedNodeRename,
	type DeltaFieldChanges,
	type DeltaMark,
	type DeltaRoot,
	type DeltaVisitor,
	type DetachedFieldIndex,
	type FieldKey,
	type MapTree,
	type RevisionTag,
	makeDetachedFieldIndex,
	visitDelta,
} from "../../core/index.js";
import { brand } from "../../util/index.js";
import {
	chunkFromJsonTrees,
	chunkToMapTreeField,
	mintRevisionTag,
	rootFromDeltaFieldMap,
	testIdCompressor,
	testRevisionTagCodec,
	type DeltaParams,
} from "../utils.js";
import { deepFreeze } from "@fluidframework/test-runtime-utils/internal";
import { mapTreeFromCursor } from "../../feature-libraries/index.js";

function visit(
	delta: DeltaRoot,
	visitor: DeltaVisitor,
	detachedFieldIndex?: DetachedFieldIndex,
	revision?: RevisionTag,
): void {
	deepFreeze(delta);
	visitDelta(
		delta,
		visitor,
		detachedFieldIndex ?? makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor),
		revision,
	);
}

type CallSignatures<T> = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[K in keyof T]: T[K] extends (...args: any) => any ? [K, ...Parameters<T[K]>] : never;
};
type PropType<T> = T[keyof T];
type VisitCall =
	| PropType<CallSignatures<Omit<DeltaVisitor, "create">>>
	| ["create", MapTree[], FieldKey];
type VisitScript = VisitCall[];

const visitorMethods: (keyof DeltaVisitor)[] = [
	"create",
	"destroy",
	"attach",
	"detach",
	"replace",
	"enterNode",
	"exitNode",
	"enterField",
	"exitField",
];

/**
 * Calls visitDelta on a DeltaRoot and checks that the result is as expected.
 *
 * @param delta - the root delta to visit
 * @param expected - the expected result of the call to visitDelta
 * @param detachedFieldIndex - an optional detached field index to get refresher data from
 * @param revision - an optional revision for the delta being visited
 */
function testDeltaVisit(
	delta: DeltaRoot,
	expected: Readonly<VisitScript>,
	detachedFieldIndex?: DetachedFieldIndex,
	revision?: RevisionTag,
): void {
	let callIndex = 0;
	const result: VisitScript = [];
	const makeChecker =
		(name: keyof DeltaVisitor) =>
		(...args: unknown[]) => {
			const call: VisitCall =
				name === "create"
					? ([
							name,
							(args as Parameters<DeltaVisitor["create"]>)[0].map(mapTreeFromCursor),
							args[1],
						] as VisitCall)
					: ([name, ...args] as VisitCall);
			result.push(call);
			// To break when the first off script event happens, enable this line:
			// assert.deepStrictEqual([name, ...args], expected[callIndex]);
			callIndex += 1;
		};
	const visitor: DeltaVisitor = {} as unknown as DeltaVisitor;
	for (const methodName of visitorMethods) {
		visitor[methodName] = makeChecker(methodName);
	}
	visit(delta, visitor, detachedFieldIndex, revision);
	assert.deepEqual(result, expected);
}

/**
 * Creates a DeltaRoot from the provided parameters and calls `testDeltaVisit` on the result.
 */
function testTreeVisit(
	marks: DeltaFieldChanges,
	expected: Readonly<VisitScript>,
	params?: DeltaParams,
): void {
	const { detachedFieldIndex, revision, global, rename, build, destroy } = params ?? {};
	const rootDelta = rootFromDeltaFieldMap(
		new Map([[rootKey, marks]]),
		global,
		rename,
		build,
		destroy,
	);
	testDeltaVisit(rootDelta, expected, detachedFieldIndex, revision);
}

const rootKey: FieldKey = brand("root");
const fooKey: FieldKey = brand("foo");
const barKey: FieldKey = brand("bar");
const chunkX = chunkFromJsonTrees(["X"]);
const chunkY = chunkFromJsonTrees(["Y"]);
const chunkXY = chunkFromJsonTrees(["X", "Y"]);
const mapTreeX = chunkToMapTreeField(chunkX);
const mapTreeY = chunkToMapTreeField(chunkY);
const field0: FieldKey = brand("-0");
const field1: FieldKey = brand("-1");
const field2: FieldKey = brand("-2");
const field3: FieldKey = brand("-3");

describe("visitDelta", () => {
	it("empty delta", () => {
		testTreeVisit(
			[],
			[
				["enterField", rootKey],
				["exitField", rootKey],
				["enterField", rootKey],
				["exitField", rootKey],
			],
		);
	});
	it("insert root", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const node = { minor: 42 };
		const rootFieldDelta: DeltaFieldChanges = [{ count: 1, attach: node }];
		const delta: DeltaRoot = {
			build: [{ id: node, trees: chunkX }],
			fields: new Map([[rootKey, rootFieldDelta]]),
		};
		const expected: VisitScript = [
			["create", mapTreeX, field0],
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", rootKey],
			["attach", field0, 1, 0],
			["exitField", rootKey],
		];
		testDeltaVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("throws on build of existing tree", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const node = { minor: 42 };
		index.createEntry(node);
		const rootFieldDelta: DeltaFieldChanges = [{ count: 1, attach: node }];
		const delta: DeltaRoot = {
			build: [{ id: node, trees: chunkX }],
			fields: new Map([[rootKey, rootFieldDelta]]),
		};
		assert.throws(() => testDeltaVisit(delta, [], index));
		assert.deepEqual(Array.from(index.entries()), [{ id: { minor: 42 }, root: 0 }]);
	});
	it("insert child", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const buildId = { minor: 42 };
		const rootFieldDelta: DeltaFieldChanges = [
			{
				count: 1,
				fields: new Map([[fooKey, [{ count: 1, attach: buildId }]]]),
			},
		];
		const expected: VisitScript = [
			["create", mapTreeX, field0],
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["attach", field0, 1, 0],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
		];
		const delta: DeltaRoot = {
			build: [{ id: buildId, trees: chunkX }],
			fields: new Map([[rootKey, rootFieldDelta]]),
		};
		testDeltaVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("remove root", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const mark: DeltaMark = {
			count: 2,
			detach: { minor: 42 },
		};
		const marks = [{ count: 1 }, mark];
		testTreeVisit(
			marks,
			[
				["enterField", rootKey],
				["detach", { start: 1, end: 2 }, field0],
				["detach", { start: 1, end: 2 }, field1],
				["exitField", rootKey],
				["enterField", rootKey],
				["exitField", rootKey],
			],
			{
				detachedFieldIndex: index,
			},
		);
		assert.deepEqual(Array.from(index.entries()), [
			{ id: { minor: 42 }, root: 0 },
			{ id: { minor: 43 }, root: 1 },
		]);
	});
	it("remove child", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const remove: DeltaMark = {
			count: 1,
			detach: { minor: 42 },
		};
		const mark: DeltaMark = {
			count: 1,
			fields: new Map([[fooKey, [{ count: 42 }, remove]]]),
		};
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["detach", { start: 42, end: 43 }, field0],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
		];
		testTreeVisit([mark], expected, { detachedFieldIndex: index });
		assert.deepEqual(Array.from(index.entries()), [{ id: { minor: 42 }, root: 0 }]);
	});
	it("changes under insert", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const moveId = { minor: 1 };
		const moveOut: DeltaMark = {
			count: 1,
			detach: moveId,
		};
		const moveIn: DeltaMark = {
			count: 1,
			attach: moveId,
		};
		const delta: DeltaRoot = {
			global: [
				{
					id: { minor: 43 },
					fields: new Map([[fooKey, [{ count: 42 }, moveOut, moveIn]]]),
				},
			],
			build: [{ id: { minor: 43 }, trees: chunkX }],
			fields: new Map([[rootKey, [{ count: 1, attach: { minor: 43 } }]]]),
		};
		const expected: VisitScript = [
			["create", mapTreeX, field0],
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", field0],
			["enterNode", 0],
			["enterField", fooKey],
			["detach", { start: 42, end: 43 }, field1],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", field0],
			["enterField", rootKey],
			["attach", field0, 1, 0],
			["enterNode", 0],
			["enterField", fooKey],
			["attach", field1, 1, 42],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
		];
		testDeltaVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("move node to the right", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
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
		const marks = [{ count: 1 }, moveOut, { count: 1 }, moveIn];
		const expected: VisitScript = [
			["enterField", rootKey],
			["detach", { start: 1, end: 2 }, field0],
			["exitField", rootKey],
			["enterField", rootKey],
			["attach", field0, 1, 2],
			["exitField", rootKey],
		];
		testTreeVisit(marks, expected, { detachedFieldIndex: index });
		assert.equal(index.entries().next().done, true);
	});
	it("move children to the left", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const moveId = { minor: 1 };
		const moveOut: DeltaMark = {
			count: 2,
			detach: moveId,
		};
		const moveIn: DeltaMark = {
			count: 2,
			attach: moveId,
		};
		const modify: DeltaMark = {
			count: 1,
			fields: new Map([[fooKey, [{ count: 2 }, moveIn, { count: 3 }, moveOut]]]),
		};
		const marks = [modify];
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["detach", { start: 5, end: 6 }, field0],
			["detach", { start: 5, end: 6 }, field1],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["attach", field0, 1, 2],
			["attach", field1, 1, 3],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
		];
		testTreeVisit(marks, expected, { detachedFieldIndex: index });
		assert.equal(index.entries().next().done, true);
	});
	it("move cousins", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
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
			fields: new Map([
				[fooKey, [moveIn]],
				[barKey, [moveOut]],
			]),
		};
		const marks = [modify];
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["exitField", fooKey],
			["enterField", barKey],
			["detach", { start: 0, end: 1 }, field0],
			["exitField", barKey],
			["exitNode", 0],
			["exitField", rootKey],
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["attach", field0, 1, 0],
			["exitField", fooKey],
			["enterField", barKey],
			["exitField", barKey],
			["exitNode", 0],
			["exitField", rootKey],
		];
		testTreeVisit(marks, expected, { detachedFieldIndex: index });
		assert.equal(index.entries().next().done, true);
	});
	it("changes under remove", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const moveId = { minor: 1 };
		const moveOut: DeltaMark = {
			count: 1,
			detach: moveId,
		};
		const moveIn: DeltaMark = {
			count: 1,
			attach: moveId,
		};
		const remove: DeltaMark = {
			detach: { minor: 42 },
			count: 1,
			fields: new Map([[fooKey, [moveOut, moveIn]]]),
		};
		const marks = [remove];
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["detach", { start: 0, end: 1 }, field0],
			["exitField", fooKey],
			["exitNode", 0],
			["detach", { start: 0, end: 1 }, field1],
			["exitField", rootKey],
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", field1],
			["enterNode", 0],
			["enterField", fooKey],
			["attach", field0, 1, 0],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", field1],
		];
		testTreeVisit(marks, expected, { detachedFieldIndex: index });
		assert.deepEqual(Array.from(index.entries()), [{ id: { minor: 42 }, root: 1 }]);
	});
	it("changes under destroy", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const node1 = { minor: 42 };
		index.createEntry(node1);
		const moveId = { minor: 1 };
		const moveOut: DeltaMark = {
			count: 1,
			detach: moveId,
		};
		const moveIn: DeltaMark = {
			count: 1,
			attach: moveId,
		};
		const nested: DeltaDetachedNodeChanges = {
			id: node1,
			fields: new Map([[fooKey, [moveOut, moveIn]]]),
		};
		const delta: DeltaRoot = {
			global: [nested],
			destroy: [{ id: node1, count: 1 }],
		};
		const expected: VisitScript = [
			["enterField", field0],
			["enterNode", 0],
			["enterField", fooKey],
			["detach", { start: 0, end: 1 }, field1],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", field0],
			["enterField", field0],
			["enterNode", 0],
			["enterField", fooKey],
			["attach", field1, 1, 0],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", field0],
			["destroy", field0, 1],
		];
		testDeltaVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("destroy (root level)", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const id = { minor: 42 };
		index.createEntry(id, undefined, 2);
		const delta: DeltaRoot = {
			destroy: [{ id, count: 2 }],
		};
		const expected: VisitScript = [
			["destroy", field0, 1],
			["destroy", field1, 1],
		];
		testDeltaVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("build-rename-destroy (field level)", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const buildId = { minor: 42 };
		const detachId = { minor: 43 };
		const delta: DeltaRoot = {
			rename: [{ oldId: buildId, newId: detachId, count: 1 }],
			build: [{ id: buildId, trees: chunkX }],
			destroy: [{ id: detachId, count: 1 }],
		};
		const expected: VisitScript = [
			["create", mapTreeX, field0],
			["enterField", field0],
			["detach", { start: 0, end: 1 }, field1],
			["exitField", field0],
			["destroy", field1, 1],
		];
		testDeltaVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("changes under move-out", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const moveId1 = { minor: 1 };
		const moveId2 = { minor: 2 };
		const moveIn1: DeltaMark = {
			count: 1,
			attach: moveId1,
		};
		const moveOut2: DeltaMark = {
			count: 1,
			detach: moveId2,
		};
		const moveIn2: DeltaMark = {
			count: 1,
			attach: moveId2,
		};
		const moveOut1: DeltaMark = {
			count: 1,
			detach: moveId1,
			fields: new Map([[fooKey, [moveOut2, moveIn2]]]),
		};
		const marks = [moveOut1, moveIn1];
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["detach", { start: 0, end: 1 }, field0],
			["exitField", fooKey],
			["exitNode", 0],
			["detach", { start: 0, end: 1 }, field1],
			["exitField", rootKey],
			["enterField", rootKey],
			["attach", field1, 1, 0],
			["enterNode", 0],
			["enterField", fooKey],
			["attach", field0, 1, 0],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
		];
		testTreeVisit(marks, expected, { detachedFieldIndex: index });
		assert.equal(index.entries().next().done, true);
	});

	it("changes under move-out of range", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const buildId = { minor: 1 };
		const moveId = { minor: 2 };

		const attach: DeltaMark = { count: 1, attach: buildId };
		const moveIn: DeltaMark = {
			count: 2,
			attach: moveId,
		};

		const moveOut1: DeltaMark = {
			count: 1,
			detach: moveId,
		};

		const moveOut2: DeltaMark = {
			count: 1,
			detach: { minor: 3 },
			fields: new Map([[fooKey, [attach]]]),
		};

		const fieldChanges: DeltaFieldChanges = [moveOut1, moveOut2, moveIn];

		const delta: DeltaRoot = {
			build: [{ id: buildId, trees: chunkX }],
			fields: new Map([[rootKey, fieldChanges]]),
		};

		const expected: VisitScript = [
			["create", mapTreeX, field0],
			["enterField", rootKey],
			["detach", { start: 0, end: 1 }, field1],
			["enterNode", 0],
			["enterField", fooKey],
			["exitField", fooKey],
			["exitNode", 0],
			["detach", { start: 0, end: 1 }, field2],
			["exitField", rootKey],
			["enterField", rootKey],
			["attach", field1, 1, 0],
			["attach", field2, 1, 1],
			["enterNode", 1],
			["enterField", fooKey],
			["attach", field0, 1, 0],
			["exitField", fooKey],
			["exitNode", 1],
			["exitField", rootKey],
		];

		testDeltaVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});

	it("replace nodes", () => {
		const buildId = { minor: 0 };

		const replace: DeltaMark = {
			count: 2,
			detach: { minor: 2 },
			attach: buildId,
		};

		const fieldChanges: DeltaFieldChanges = [replace];
		const delta: DeltaRoot = {
			build: [{ id: buildId, trees: chunkXY }],
			fields: new Map([[rootKey, fieldChanges]]),
		};

		const expected: VisitScript = [
			["create", mapTreeX, field0],
			["create", mapTreeY, field1],
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", rootKey],
			["replace", field0, { start: 0, end: 1 }, field2],
			["replace", field1, { start: 1, end: 2 }, field3],
			["exitField", rootKey],
		];

		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		testDeltaVisit(delta, expected, index);
	});

	it("changes under replaced node", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const moveId1 = { minor: 1 };
		const moveId2 = { minor: 2 };
		const moveOut2: DeltaMark = {
			count: 1,
			detach: moveId2,
		};
		const moveOut1: DeltaMark = {
			count: 1,
			detach: moveId1,
		};
		const moveIn2: DeltaMark = {
			count: 1,
			attach: moveId2,
		};
		const replace: DeltaMark = {
			count: 1,
			detach: { minor: 42 },
			attach: moveId1,
			fields: new Map([[fooKey, [moveOut2, moveIn2]]]),
		};
		const marks = [replace, moveOut1];
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["detach", { start: 0, end: 1 }, field0],
			["exitField", fooKey],
			["exitNode", 0],
			["detach", { start: 1, end: 2 }, field1],
			["exitField", rootKey],
			["enterField", rootKey],
			["replace", field1, { start: 0, end: 1 }, field2],
			["exitField", rootKey],
			["enterField", field2],
			["enterNode", 0],
			["enterField", fooKey],
			["attach", field0, 1, 0],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", field2],
		];
		testTreeVisit(marks, expected, { detachedFieldIndex: index });
		assert.deepEqual(Array.from(index.entries()), [{ id: { minor: 42 }, root: 2 }]);
	});

	it("changes under replacement node", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const moveId1 = { minor: 1 };
		const moveId2 = { minor: 2 };
		const moveOut2: DeltaMark = {
			count: 1,
			detach: moveId2,
		};
		const moveIn2: DeltaMark = {
			count: 1,
			attach: moveId2,
		};
		const moveOut1: DeltaMark = {
			count: 1,
			detach: moveId1,
			fields: new Map([[fooKey, [moveOut2, moveIn2]]]),
		};
		const replace: DeltaMark = {
			count: 1,
			detach: { minor: 42 },
			attach: moveId1,
		};
		const marks = [replace, moveOut1];
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 1],
			["enterField", fooKey],
			["detach", { start: 0, end: 1 }, field0],
			["exitField", fooKey],
			["exitNode", 1],
			["detach", { start: 1, end: 2 }, field1],
			["exitField", rootKey],
			["enterField", rootKey],
			["replace", field1, { start: 0, end: 1 }, field2],
			["enterNode", 0],
			["enterField", fooKey],
			["attach", field0, 1, 0],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
		];
		testTreeVisit(marks, expected, { detachedFieldIndex: index });
		assert.deepEqual(Array.from(index.entries()), [{ id: { minor: 42 }, root: 2 }]);
	});
	it("transient insert", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const delta: DeltaRoot = {
			build: [{ id: { minor: 42 }, trees: chunkX }],
			rename: [{ oldId: { minor: 42 }, count: 1, newId: { minor: 43 } }],
		};
		const expected: VisitScript = [
			["create", mapTreeX, field0],
			["enterField", field0],
			["detach", { start: 0, end: 1 }, field1],
			["exitField", field0],
		];
		testDeltaVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [{ id: { minor: 43 }, root: 1 }]);
	});
	it("changes under transient", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const moveId = { minor: 1 };
		const moveOut: DeltaMark = {
			count: 1,
			detach: moveId,
		};
		const moveIn: DeltaMark = {
			count: 1,
			attach: moveId,
		};
		const buildId = { minor: 42 };
		const detachId = { minor: 43 };
		const delta: DeltaRoot = {
			build: [{ id: buildId, trees: chunkX }],
			global: [{ id: buildId, fields: new Map([[barKey, [moveOut, moveIn]]]) }],
			rename: [{ oldId: buildId, count: 1, newId: detachId }],
		};
		const expected: VisitScript = [
			["create", mapTreeX, field0], // field0: buildId
			["enterField", field0],
			["enterNode", 0],
			["enterField", barKey],
			["detach", { start: 0, end: 1 }, field1], // field1: moveId
			["exitField", barKey],
			["exitNode", 0],
			["exitField", field0],
			["enterField", field0],
			["detach", { start: 0, end: 1 }, field2], // field2: detachId
			["exitField", field0],
			["enterField", field2],
			["enterNode", 0],
			["enterField", barKey],
			["attach", field1, 1, 0],
			["exitField", barKey],
			["exitNode", 0],
			["exitField", field2],
		];
		testDeltaVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [{ id: detachId, root: 2 }]);
	});
	it("restore", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const node1 = { minor: 1 };
		index.createEntry(node1);
		const restore: DeltaMark = {
			count: 1,
			attach: node1,
		};
		const marks = [restore];
		const expected: VisitScript = [
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", rootKey],
			["attach", field0, 1, 0],
			["exitField", rootKey],
		];
		testTreeVisit(marks, expected, { detachedFieldIndex: index });
		assert.equal(index.entries().next().done, true);
	});
	it("move removed node", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const node1 = { minor: 1 };
		index.createEntry(node1);
		const moveId = { minor: 2 };
		const rename: DeltaDetachedNodeRename = {
			count: 1,
			oldId: node1,
			newId: moveId,
		};
		const moveIn: DeltaMark = {
			count: 1,
			attach: moveId,
		};
		const marks = [moveIn];
		const expected: VisitScript = [
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", field0],
			["detach", { start: 0, end: 1 }, field1],
			["exitField", field0],
			["enterField", rootKey],
			["attach", field1, 1, 0],
			["exitField", rootKey],
		];
		testTreeVisit(marks, expected, { detachedFieldIndex: index, rename: [rename] });
		assert.equal(index.entries().next().done, true);
	});
	it("changes under removed node", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const node1 = { minor: 1 };
		index.createEntry(node1);
		const moveId = { minor: 2 };
		const moveOut: DeltaMark = {
			count: 1,
			detach: moveId,
		};
		const moveIn: DeltaMark = {
			count: 1,
			attach: moveId,
		};
		const modify: DeltaDetachedNodeChanges = {
			id: { minor: 1 },
			fields: new Map([[fooKey, [moveOut, moveIn]]]),
		};
		const delta = { global: [modify] };
		const expected: VisitScript = [
			["enterField", field0],
			["enterNode", 0],
			["enterField", fooKey],
			["detach", { start: 0, end: 1 }, field1],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", field0],
			["enterField", field0],
			["enterNode", 0],
			["enterField", fooKey],
			["attach", field1, 1, 0],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", field0],
		];
		testDeltaVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [{ id: { minor: 1 }, root: 0 }]);
	});
	it("changes under transient move-in", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const moveId1 = { minor: 1 };
		const moveId2 = { minor: 2 };
		const detachId = { minor: 42 };
		const moveOut: DeltaMark = {
			count: 1,
			detach: moveId1,
			fields: new Map([
				[
					fooKey,
					[
						{ count: 1, detach: moveId2 },
						{ count: 1, attach: moveId2 },
					],
				],
			]),
		};
		const moveIn: DeltaDetachedNodeRename = {
			count: 1,
			oldId: moveId1,
			newId: detachId,
		};
		const delta: DeltaRoot = { fields: new Map([[rootKey, [moveOut]]]), rename: [moveIn] };
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["detach", { start: 0, end: 1 }, field0], // field0: moveId2
			["exitField", fooKey],
			["exitNode", 0],
			["detach", { start: 0, end: 1 }, field1], // field1: moveId1
			["exitField", rootKey],
			["enterField", field1],
			["detach", { start: 0, end: 1 }, field2], // field2: detachId
			["exitField", field1],
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", field2],
			["enterNode", 0],
			["enterField", fooKey],
			["attach", field0, 1, 0],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", field2],
		];
		testDeltaVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [{ id: detachId, root: 2 }]);
	});
	it("transient restore", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const node1 = { minor: 1 };
		index.createEntry(node1);
		const restore: DeltaDetachedNodeRename = {
			count: 1,
			oldId: node1,
			newId: { minor: 42 },
		};
		const delta = { rename: [restore] };
		const expected: VisitScript = [
			["enterField", field0],
			["detach", { start: 0, end: 1 }, field1],
			["exitField", field0],
		];
		testDeltaVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [{ id: { minor: 42 }, root: 1 }]);
	});
	it("update detached node", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const node1 = { minor: 1 };
		index.createEntry(node1);
		const buildId = { minor: 2 };
		const detachId = { minor: 42 };
		const renameOldNode: DeltaDetachedNodeRename = {
			count: 1,
			oldId: node1,
			newId: detachId,
		};
		const renameNewNode: DeltaDetachedNodeRename = {
			count: 1,
			oldId: buildId,
			newId: node1,
		};
		const delta = {
			build: [{ id: buildId, trees: chunkX }],
			rename: [renameOldNode, renameNewNode],
		};
		const expected: VisitScript = [
			["create", mapTreeX, field1], // field1: buildId
			["enterField", field0], // field0: node1
			["detach", { start: 0, end: 1 }, field2], // field2: detachId
			["exitField", field0],
			["enterField", field1],
			["detach", { start: 0, end: 1 }, field3], // field3: node1
			["exitField", field1],
		];
		testDeltaVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [
			{ id: detachId, root: 2 },
			{ id: node1, root: 3 },
		]);
	});

	describe("refreshers", () => {
		it("for restores at the root", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const node = { minor: 42 };
			const rootFieldDelta: DeltaFieldChanges = [{ count: 1, attach: node }];
			const delta: DeltaRoot = {
				refreshers: [{ id: node, trees: chunkX }],
				fields: new Map([[rootKey, rootFieldDelta]]),
			};
			const expected: VisitScript = [
				["enterField", rootKey],
				["exitField", rootKey],
				["enterField", rootKey],
				["create", mapTreeX, field0],
				["attach", field0, 1, 0],
				["exitField", rootKey],
			];
			testDeltaVisit(delta, expected, index);
			assert.equal(index.entries().next().done, true);
		});

		it("for restores under a child", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const buildId = { minor: 42 };
			const rootFieldDelta: DeltaFieldChanges = [
				{
					count: 1,
					fields: new Map([[fooKey, [{ count: 1, attach: buildId }]]]),
				},
			];
			const expected: VisitScript = [
				["enterField", rootKey],
				["enterNode", 0],
				["enterField", fooKey],
				["exitField", fooKey],
				["exitNode", 0],
				["exitField", rootKey],
				["enterField", rootKey],
				["enterNode", 0],
				["enterField", fooKey],
				["create", mapTreeX, field0],
				["attach", field0, 1, 0],
				["exitField", fooKey],
				["exitNode", 0],
				["exitField", rootKey],
			];
			const delta: DeltaRoot = {
				refreshers: [{ id: buildId, trees: chunkX }],
				fields: new Map([[rootKey, rootFieldDelta]]),
			};
			testDeltaVisit(delta, expected, index);
			assert.equal(index.entries().next().done, true);
		});

		it("for partial restores", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const node = { minor: 42 };
			const rootFieldDelta: DeltaFieldChanges = [{ count: 1, attach: { minor: 43 } }];
			const delta: DeltaRoot = {
				refreshers: [{ id: node, trees: chunkXY }],
				fields: new Map([[rootKey, rootFieldDelta]]),
			};
			const expected: VisitScript = [
				["enterField", rootKey],
				["exitField", rootKey],
				["enterField", rootKey],
				["create", mapTreeY, field0],
				["attach", field0, 1, 0],
				["exitField", rootKey],
			];
			testDeltaVisit(delta, expected, index);
			assert.equal(index.entries().next().done, true);
		});

		it("for changes to detached trees", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const refresherId = { minor: 42 };
			const buildId = { minor: 43 };
			const expected: VisitScript = [
				["create", mapTreeX, field0],
				["create", mapTreeX, field1],
				["enterField", field1],
				["enterNode", 0],
				["enterField", fooKey],
				["exitField", fooKey],
				["exitNode", 0],
				["exitField", field1],
				["enterField", field1],
				["enterNode", 0],
				["enterField", fooKey],
				["attach", field0, 1, 0],
				["exitField", fooKey],
				["exitNode", 0],
				["exitField", field1],
			];
			const delta: DeltaRoot = {
				global: [
					{
						id: refresherId,
						fields: new Map([[fooKey, [{ count: 1, attach: buildId }]]]),
					},
				],
				refreshers: [{ id: refresherId, trees: chunkX }],
				build: [{ id: buildId, trees: chunkX }],
				// TODO the global was in this so it might've changed the expected value
				// fields: new Map([[rootKey, rootFieldDelta]]),
			};
			testDeltaVisit(delta, expected, index);
		});
	});

	it("creates refreshers and updates latest revision for root transfers", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const node1 = { minor: 1 };
		index.createEntry(node1);
		const moveId = { minor: 2 };
		const rename: DeltaDetachedNodeRename = {
			count: 1,
			oldId: node1,
			newId: moveId,
		};
		const delta = {
			refreshers: [{ id: node1, trees: chunkX }],
			rename: [rename],
		};
		const expected: VisitScript = [
			["enterField", field0],
			["detach", { start: 0, end: 1 }, field1],
			["exitField", field0],
		];
		const revision = mintRevisionTag();
		testDeltaVisit(delta, expected, index, revision);
		const iteratorResult = index.entries().next();
		assert.equal(iteratorResult.done, false);
		assert.deepEqual(iteratorResult.value.id, moveId);
		assert.equal(iteratorResult.value.latestRelevantRevision, revision);
	});

	describe("updates latest revision", () => {
		it("when building a detached tree", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const node = { minor: 42 };
			const delta: DeltaRoot = {
				build: [{ id: node, trees: chunkX }],
			};
			const expected: VisitScript = [["create", mapTreeX, field0]];
			const revision = mintRevisionTag();
			testDeltaVisit(delta, expected, index, revision);
			assert.deepEqual(Array.from(index.entries()), [
				{ id: node, root: 0, latestRelevantRevision: revision },
			]);
		});

		it("when applying changes to detached trees", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const node1 = { minor: 1 };
			index.createEntry(node1);
			const moveId = { minor: 2 };
			const moveOut: DeltaMark = {
				count: 1,
				detach: moveId,
			};
			const moveIn: DeltaMark = {
				count: 1,
				attach: moveId,
			};
			const modify: DeltaDetachedNodeChanges = {
				id: node1,
				fields: new Map([[fooKey, [moveOut, moveIn]]]),
			};
			const global = [modify];
			const expected: VisitScript = [
				["enterField", rootKey],
				["exitField", rootKey],
				["enterField", field0],
				["enterNode", 0],
				["enterField", fooKey],
				["detach", { start: 0, end: 1 }, field1],
				["exitField", fooKey],
				["exitNode", 0],
				["exitField", field0],
				["enterField", rootKey],
				["exitField", rootKey],
				["enterField", field0],
				["enterNode", 0],
				["enterField", fooKey],
				["attach", field1, 1, 0],
				["exitField", fooKey],
				["exitNode", 0],
				["exitField", field0],
			];
			const revision = mintRevisionTag();
			testTreeVisit([], expected, { detachedFieldIndex: index, revision, global });
			assert.deepEqual(Array.from(index.entries()), [
				{ id: node1, root: 0, latestRelevantRevision: revision },
			]);
		});

		it("for detached trees created during replaces", () => {
			const buildId = { minor: 0 };

			const replace: DeltaMark = {
				count: 2,
				detach: { minor: 2 },
			};

			const rootChanges: DeltaFieldChanges = [replace];
			const delta: DeltaRoot = {
				build: [{ id: buildId, trees: chunkXY }],
				fields: new Map([[rootKey, rootChanges]]),
			};

			const expected: VisitScript = [
				["create", mapTreeX, field0],
				["create", mapTreeY, field1],
				["enterField", rootKey],
				["detach", { start: 0, end: 1 }, field2],
				["detach", { start: 0, end: 1 }, field3],
				["exitField", rootKey],
				["enterField", rootKey],
				["exitField", rootKey],
			];

			const revision = mintRevisionTag();
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			testDeltaVisit(delta, expected, index, revision);
			const iteratorResult = index.entries().next();
			assert.equal(iteratorResult.done, false);
			assert.deepEqual(iteratorResult.value.id, buildId);
			assert.equal(iteratorResult.value.latestRelevantRevision, revision);
		});
	});

	describe("tolerates superfluous refreshers", () => {
		it("when the delta can be applied without the refresher", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const node = { minor: 42 };
			const node2 = { minor: 43 };
			const rootFieldDelta: DeltaFieldChanges = [{ count: 1, attach: node2 }];
			const delta: DeltaRoot = {
				refreshers: [
					{ id: node, trees: chunkX },
					{ id: node2, trees: chunkX },
				],
				fields: new Map([[rootKey, rootFieldDelta]]),
			};
			const expected: VisitScript = [
				["enterField", rootKey],
				["exitField", rootKey],
				["enterField", rootKey],
				["create", mapTreeX, field0],
				["attach", field0, 1, 0],
				["exitField", rootKey],
			];
			testDeltaVisit(delta, expected, index);
			assert.equal(index.entries().next().done, true);
		});

		it("when the refreshed tree already exists in the forest", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const node = { minor: 42 };
			index.createEntry(node, undefined, 1);
			const rootFieldDelta: DeltaFieldChanges = [{ count: 1, attach: node }];
			const delta: DeltaRoot = {
				refreshers: [{ id: node, trees: chunkX }],
				fields: new Map([[rootKey, rootFieldDelta]]),
			};
			const expected: VisitScript = [
				["enterField", rootKey],
				["exitField", rootKey],
				["enterField", rootKey],
				["attach", field0, 1, 0],
				["exitField", rootKey],
			];
			testDeltaVisit(delta, expected, index);
			assert.equal(index.entries().next().done, true);
		});

		it("when the refreshed tree is included in the builds", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const node = { minor: 42 };
			const rootFieldDelta: DeltaFieldChanges = [{ count: 1, attach: node }];
			const delta: DeltaRoot = {
				build: [{ id: node, trees: chunkX }],
				refreshers: [{ id: node, trees: chunkX }],
				fields: new Map([[rootKey, rootFieldDelta]]),
			};
			const expected: VisitScript = [
				["create", mapTreeX, field0],
				["enterField", rootKey],
				["exitField", rootKey],
				["enterField", rootKey],
				["attach", field0, 1, 0],
				["exitField", rootKey],
			];
			testDeltaVisit(delta, expected, index);
			assert.equal(index.entries().next().done, true);
		});
	});

	describe("rename chains", () => {
		const pointA = { minor: 1 };
		for (const cycle of [false, true]) {
			describe(cycle ? "cyclic" : "acyclic", () => {
				const end = cycle ? pointA : { minor: 42 };
				describe("1-step", () => {
					it("Rename ordering: 1/1", () => {
						const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
						index.createEntry(pointA);
						const rename: DeltaDetachedNodeRename = {
							count: 1,
							oldId: pointA,
							newId: end,
						};
						const delta = {
							rename: [rename],
						};
						const expected: VisitScript = cycle
							? []
							: [
									["enterField", field0],
									["detach", { start: 0, end: 1 }, field1],
									["exitField", field0],
								];
						testDeltaVisit(delta, expected, index);
						assert.deepEqual(Array.from(index.entries()), [{ id: end, root: cycle ? 0 : 1 }]);
					});
				});
				describe("2-step", () => {
					for (let ordering = 1; ordering <= 2; ordering++) {
						it(`Rename ordering: ${ordering}/2`, () => {
							const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
							index.createEntry(pointA);
							const pointB = { minor: 2 };
							const rename1: DeltaDetachedNodeRename = {
								count: 1,
								oldId: pointA,
								newId: pointB,
							};
							const rename2: DeltaDetachedNodeRename = {
								count: 1,
								oldId: pointB,
								newId: cycle ? pointA : end,
							};
							const delta = {
								rename: [
									[rename1, rename2],
									[rename2, rename1],
								][ordering - 1],
							};
							const expected: VisitScript = [
								["enterField", field0],
								["detach", { start: 0, end: 1 }, field1],
								["exitField", field0],
								["enterField", field1],
								["detach", { start: 0, end: 1 }, field2],
								["exitField", field1],
							];
							testDeltaVisit(delta, expected, index);
							assert.deepEqual(Array.from(index.entries()), [{ id: end, root: 2 }]);
						});
					}
				});
				describe("3-step", () => {
					for (let ordering = 1; ordering <= 6; ordering++) {
						it(`Rename ordering: ${ordering}/6`, () => {
							const pointB = { minor: 2 };
							const pointC = { minor: 3 };
							const ab: DeltaDetachedNodeRename = {
								count: 1,
								oldId: pointA,
								newId: pointB,
							};
							const bc: DeltaDetachedNodeRename = {
								count: 1,
								oldId: pointB,
								newId: pointC,
							};
							const cd: DeltaDetachedNodeRename = {
								count: 1,
								oldId: pointC,
								newId: end,
							};
							const delta = {
								rename: [
									[ab, bc, cd],
									[ab, cd, bc],
									[bc, ab, cd],
									[bc, cd, ab],
									[cd, ab, bc],
									[cd, bc, ab],
								][ordering - 1],
							};
							const expected: VisitScript = [
								["enterField", field0],
								["detach", { start: 0, end: 1 }, field1],
								["exitField", field0],
								["enterField", field1],
								["detach", { start: 0, end: 1 }, field2],
								["exitField", field1],
								["enterField", field2],
								["detach", { start: 0, end: 1 }, field3],
								["exitField", field2],
							];
							const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
							index.createEntry(pointA);
							testDeltaVisit(delta, expected, index);
							assert.deepEqual(Array.from(index.entries()), [{ id: end, root: 3 }]);
						});
					}
				});
			});
		}
	});
});

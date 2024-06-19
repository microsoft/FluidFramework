/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	type DeltaDetachedNodeBuild,
	type DeltaDetachedNodeChanges,
	type DeltaDetachedNodeDestruction,
	type DeltaDetachedNodeRename,
	type DeltaFieldChanges,
	type DeltaMark,
	type DeltaRoot,
	type DeltaVisitor,
	type DetachedFieldIndex,
	type FieldKey,
	makeDetachedFieldIndex,
	visitDelta,
} from "../../core/index.js";
import { leaf } from "../../domains/index.js";
import { cursorForJsonableTreeNode } from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
import { rootFromDeltaFieldMap, testIdCompressor, testRevisionTagCodec } from "../utils.js";
import { deepFreeze } from "@fluidframework/test-runtime-utils/internal";

function visit(
	delta: DeltaRoot,
	visitor: DeltaVisitor,
	detachedFieldIndex?: DetachedFieldIndex,
): void {
	deepFreeze(delta);
	visitDelta(
		delta,
		visitor,
		detachedFieldIndex ?? makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor),
	);
}

type CallSignatures<T> = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[K in keyof T]: T[K] extends (...args: any) => any ? [K, ...Parameters<T[K]>] : never;
};
type PropType<T> = T[keyof T];
type VisitCall = PropType<CallSignatures<DeltaVisitor>>;
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

function testVisit(
	delta: DeltaRoot,
	expected: Readonly<VisitScript>,
	detachedFieldIndex?: DetachedFieldIndex,
): void {
	let callIndex = 0;
	const result: VisitScript = [];
	const makeChecker =
		(name: string) =>
		(...args: unknown[]) => {
			result.push([name, ...args] as VisitCall);
			// To break when the first off script event happens, enable this line:
			// assert.deepStrictEqual([name, ...args], expected[callIndex]);
			callIndex += 1;
		};
	const visitor: DeltaVisitor = {} as unknown as DeltaVisitor;
	for (const methodName of visitorMethods) {
		visitor[methodName] = makeChecker(methodName);
	}
	visit(delta, visitor, detachedFieldIndex);
	assert.deepEqual(result, expected);
}

function testTreeVisit(
	marks: DeltaFieldChanges,
	expected: Readonly<VisitScript>,
	detachedFieldIndex?: DetachedFieldIndex,
	build?: readonly DeltaDetachedNodeBuild[],
	destroy?: readonly DeltaDetachedNodeDestruction[],
): void {
	const rootDelta = rootFromDeltaFieldMap(new Map([[rootKey, marks]]), build, destroy);
	testVisit(rootDelta, expected, detachedFieldIndex);
}

const rootKey: FieldKey = brand("root");
const fooKey: FieldKey = brand("foo");
const barKey: FieldKey = brand("bar");
const nodeX = { type: leaf.string.name, value: "X" };
const content = cursorForJsonableTreeNode(nodeX);
const field0: FieldKey = brand("-0");
const field1: FieldKey = brand("-1");
const field2: FieldKey = brand("-2");
const field3: FieldKey = brand("-3");

describe("visitDelta", () => {
	it("empty delta", () => {
		testTreeVisit({}, [
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", rootKey],
			["exitField", rootKey],
		]);
	});
	it("insert root", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const node = { minor: 42 };
		const rootFieldDelta: DeltaFieldChanges = {
			local: [{ count: 1, attach: node }],
		};
		const delta: DeltaRoot = {
			build: [{ id: node, trees: [content] }],
			fields: new Map([[rootKey, rootFieldDelta]]),
		};
		const expected: VisitScript = [
			["create", [content], field0],
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", rootKey],
			["attach", field0, 1, 0],
			["exitField", rootKey],
		];
		testVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("throws on build of existing tree", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const node = { minor: 42 };
		index.createEntry(node);
		const rootFieldDelta: DeltaFieldChanges = {
			local: [{ count: 1, attach: node }],
		};
		const delta: DeltaRoot = {
			build: [{ id: node, trees: [content] }],
			fields: new Map([[rootKey, rootFieldDelta]]),
		};
		assert.throws(() => testVisit(delta, [], index));
		assert.deepEqual(Array.from(index.entries()), [{ id: { minor: 42 }, root: 0 }]);
	});
	it("insert child", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const buildId = { minor: 42 };
		const rootFieldDelta: DeltaFieldChanges = {
			local: [
				{
					count: 1,
					fields: new Map([[fooKey, { local: [{ count: 1, attach: buildId }] }]]),
				},
			],
		};
		const expected: VisitScript = [
			["create", [content], field0],
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
			build: [{ id: buildId, trees: [content] }],
			fields: new Map([[rootKey, rootFieldDelta]]),
		};
		testVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("remove root", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const mark: DeltaMark = {
			count: 2,
			detach: { minor: 42 },
		};
		const delta = { local: [{ count: 1 }, mark] };
		testTreeVisit(
			delta,
			[
				["enterField", rootKey],
				["detach", { start: 1, end: 2 }, field0],
				["detach", { start: 1, end: 2 }, field1],
				["exitField", rootKey],
				["enterField", rootKey],
				["exitField", rootKey],
			],
			index,
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
			fields: new Map([[fooKey, { local: [{ count: 42 }, remove] }]]),
		};
		const delta = { local: [mark] };
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
		testTreeVisit(delta, expected, index);
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
		const delta: DeltaFieldChanges = {
			global: [
				{
					id: { minor: 43 },
					fields: new Map([[fooKey, { local: [{ count: 42 }, moveOut, moveIn] }]]),
				},
			],
			local: [{ count: 1, attach: { minor: 43 } }],
		};
		const expected: VisitScript = [
			["create", [content], field0],
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
		testTreeVisit(delta, expected, index, [{ id: { minor: 43 }, trees: [content] }]);
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
		const delta = { local: [{ count: 1 }, moveOut, { count: 1 }, moveIn] };
		const expected: VisitScript = [
			["enterField", rootKey],
			["detach", { start: 1, end: 2 }, field0],
			["exitField", rootKey],
			["enterField", rootKey],
			["attach", field0, 1, 2],
			["exitField", rootKey],
		];
		testTreeVisit(delta, expected, index);
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
			fields: new Map([[fooKey, { local: [{ count: 2 }, moveIn, { count: 3 }, moveOut] }]]),
		};
		const delta = { local: [modify] };
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
		testTreeVisit(delta, expected, index);
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
				[fooKey, { local: [moveIn] }],
				[barKey, { local: [moveOut] }],
			]),
		};
		const delta = { local: [modify] };
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
		testTreeVisit(delta, expected, index);
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
			fields: new Map([[fooKey, { local: [moveOut, moveIn] }]]),
		};
		const delta = { local: [remove] };
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
		testTreeVisit(delta, expected, index);
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
			fields: new Map([[fooKey, { local: [moveOut, moveIn] }]]),
		};
		const delta: DeltaFieldChanges = {
			global: [nested],
		};
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
			["destroy", field0, 1],
		];
		testTreeVisit(delta, expected, index, undefined, [{ id: node1, count: 1 }]);
		assert.equal(index.entries().next().done, true);
	});
	it("destroy (root level)", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const id = { minor: 42 };
		index.createEntry(id, 2);
		const delta: DeltaRoot = {
			destroy: [{ id, count: 2 }],
		};
		const expected: VisitScript = [
			["destroy", field0, 1],
			["destroy", field1, 1],
		];
		testVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("build-rename-destroy (field level)", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const buildId = { minor: 42 };
		const detachId = { minor: 43 };
		const delta: DeltaFieldChanges = {
			rename: [{ oldId: buildId, newId: detachId, count: 1 }],
		};
		const expected: VisitScript = [
			["create", [content], field0],
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", field0],
			["detach", { start: 0, end: 1 }, field1],
			["exitField", field0],
			["enterField", rootKey],
			["exitField", rootKey],
			["destroy", field1, 1],
		];
		testTreeVisit(
			delta,
			expected,
			index,
			[{ id: buildId, trees: [content] }],
			[{ id: detachId, count: 1 }],
		);
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
			fields: new Map([[fooKey, { local: [moveOut2, moveIn2] }]]),
		};
		const delta = { local: [moveOut1, moveIn1] };
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
		testTreeVisit(delta, expected, index);
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
			fields: new Map([[fooKey, { local: [attach] }]]),
		};

		const rootChanges: DeltaFieldChanges = { local: [moveOut1, moveOut2, moveIn] };

		const delta: DeltaRoot = {
			build: [{ id: buildId, trees: [content] }],
			fields: new Map([[rootKey, rootChanges]]),
		};

		const expected: VisitScript = [
			["create", [content], field0],
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

		testVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});

	it("replace nodes", () => {
		const buildId = { minor: 0 };

		const replace: DeltaMark = {
			count: 2,
			detach: { minor: 2 },
			attach: buildId,
		};

		const rootChanges: DeltaFieldChanges = { local: [replace] };
		const delta: DeltaRoot = {
			build: [{ id: buildId, trees: [content, content] }],
			fields: new Map([[rootKey, rootChanges]]),
		};

		const expected: VisitScript = [
			["create", [content], field0],
			["create", [content], field1],
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", rootKey],
			["replace", field0, { start: 0, end: 1 }, field2],
			["replace", field1, { start: 1, end: 2 }, field3],
			["exitField", rootKey],
		];

		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		testVisit(delta, expected, index);
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
			fields: new Map([[fooKey, { local: [moveOut2, moveIn2] }]]),
		};
		const delta = { local: [replace, moveOut1] };
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
		testTreeVisit(delta, expected, index);
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
			fields: new Map([[fooKey, { local: [moveOut2, moveIn2] }]]),
		};
		const replace: DeltaMark = {
			count: 1,
			detach: { minor: 42 },
			attach: moveId1,
		};
		const delta = { local: [replace, moveOut1] };
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
		testTreeVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [{ id: { minor: 42 }, root: 2 }]);
	});
	it("transient insert", () => {
		const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
		const delta: DeltaFieldChanges = {
			rename: [{ oldId: { minor: 42 }, count: 1, newId: { minor: 43 } }],
		};
		const expected: VisitScript = [
			["create", [content], field0],
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", field0],
			["detach", { start: 0, end: 1 }, field1],
			["exitField", field0],
			["enterField", rootKey],
			["exitField", rootKey],
		];
		testTreeVisit(delta, expected, index, [{ id: { minor: 42 }, trees: [content] }]);
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
		const delta: DeltaFieldChanges = {
			global: [{ id: buildId, fields: new Map([[barKey, { local: [moveOut, moveIn] }]]) }],
			rename: [{ oldId: buildId, count: 1, newId: detachId }],
		};
		const expected: VisitScript = [
			["create", [content], field0], // field0: buildId
			["enterField", rootKey],
			["exitField", rootKey],
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
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", field2],
			["enterNode", 0],
			["enterField", barKey],
			["attach", field1, 1, 0],
			["exitField", barKey],
			["exitNode", 0],
			["exitField", field2],
		];
		testTreeVisit(delta, expected, index, [{ id: buildId, trees: [content] }]);
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
		const delta = { local: [restore] };
		const expected: VisitScript = [
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", rootKey],
			["attach", field0, 1, 0],
			["exitField", rootKey],
		];
		testTreeVisit(delta, expected, index);
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
		const delta = {
			rename: [rename],
			local: [moveIn],
		};
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
		testTreeVisit(delta, expected, index);
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
			fields: new Map([[fooKey, { local: [moveOut, moveIn] }]]),
		};
		const delta = { global: [modify] };
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
		testTreeVisit(delta, expected, index);
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
					{
						local: [
							{ count: 1, detach: moveId2 },
							{ count: 1, attach: moveId2 },
						],
					},
				],
			]),
		};
		const moveIn: DeltaDetachedNodeRename = {
			count: 1,
			oldId: moveId1,
			newId: detachId,
		};
		const delta = { local: [moveOut], rename: [moveIn] };
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
		testTreeVisit(delta, expected, index);
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
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", field0],
			["detach", { start: 0, end: 1 }, field1],
			["exitField", field0],
			["enterField", rootKey],
			["exitField", rootKey],
		];
		testTreeVisit(delta, expected, index);
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
			rename: [renameOldNode, renameNewNode],
		};
		const expected: VisitScript = [
			["create", [content], field1], // field1: buildId
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", field0], // field0: node1
			["detach", { start: 0, end: 1 }, field2], // field2: detachId
			["exitField", field0],
			["enterField", field1],
			["detach", { start: 0, end: 1 }, field3], // field3: node1
			["exitField", field1],
			["enterField", rootKey],
			["exitField", rootKey],
		];
		testTreeVisit(delta, expected, index, [{ id: buildId, trees: [content] }]);
		assert.deepEqual(Array.from(index.entries()), [
			{ id: detachId, root: 2 },
			{ id: node1, root: 3 },
		]);
	});

	describe("refreshers", () => {
		it("for restores at the root", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const node = { minor: 42 };
			const rootFieldDelta: DeltaFieldChanges = {
				local: [{ count: 1, attach: node }],
			};
			const delta: DeltaRoot = {
				refreshers: [{ id: node, trees: [content] }],
				fields: new Map([[rootKey, rootFieldDelta]]),
			};
			const expected: VisitScript = [
				["enterField", rootKey],
				["exitField", rootKey],
				["enterField", rootKey],
				["create", [content], field0],
				["attach", field0, 1, 0],
				["exitField", rootKey],
			];
			testVisit(delta, expected, index);
			assert.equal(index.entries().next().done, true);
		});

		it("for restores under a child", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const buildId = { minor: 42 };
			const rootFieldDelta: DeltaFieldChanges = {
				local: [
					{
						count: 1,
						fields: new Map([[fooKey, { local: [{ count: 1, attach: buildId }] }]]),
					},
				],
			};
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
				["create", [content], field0],
				["attach", field0, 1, 0],
				["exitField", fooKey],
				["exitNode", 0],
				["exitField", rootKey],
			];
			const delta: DeltaRoot = {
				refreshers: [{ id: buildId, trees: [content] }],
				fields: new Map([[rootKey, rootFieldDelta]]),
			};
			testVisit(delta, expected, index);
			assert.equal(index.entries().next().done, true);
		});

		it("for partial restores", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const node = { minor: 42 };
			const rootFieldDelta: DeltaFieldChanges = {
				local: [{ count: 1, attach: { minor: 43 } }],
			};
			const delta: DeltaRoot = {
				refreshers: [{ id: node, trees: [content, content] }],
				fields: new Map([[rootKey, rootFieldDelta]]),
			};
			const expected: VisitScript = [
				["enterField", rootKey],
				["exitField", rootKey],
				["enterField", rootKey],
				["create", [content], field0],
				["attach", field0, 1, 0],
				["exitField", rootKey],
			];
			testVisit(delta, expected, index);
			assert.equal(index.entries().next().done, true);
		});

		it("for changes to detached trees", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const refresherId = { minor: 42 };
			const buildId = { minor: 43 };
			const rootFieldDelta: DeltaFieldChanges = {
				global: [
					{
						id: refresherId,
						fields: new Map([[fooKey, { local: [{ count: 1, attach: buildId }] }]]),
					},
				],
			};
			const expected: VisitScript = [
				["create", [content], field0],
				["enterField", rootKey],
				["create", [content], field1],
				["exitField", rootKey],
				["enterField", field1],
				["enterNode", 0],
				["enterField", fooKey],
				["exitField", fooKey],
				["exitNode", 0],
				["exitField", field1],
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
			const delta: DeltaRoot = {
				refreshers: [{ id: refresherId, trees: [content] }],
				build: [{ id: buildId, trees: [content] }],
				fields: new Map([[rootKey, rootFieldDelta]]),
			};
			testVisit(delta, expected, index);
		});
	});

	describe("tolerates superfluous refreshers", () => {
		it("when the delta can be applied without the refresher", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const node = { minor: 42 };
			const node2 = { minor: 43 };
			const rootFieldDelta: DeltaFieldChanges = {
				local: [{ count: 1, attach: node2 }],
			};
			const delta: DeltaRoot = {
				refreshers: [
					{ id: node, trees: [content] },
					{ id: node2, trees: [content] },
				],
				fields: new Map([[rootKey, rootFieldDelta]]),
			};
			const expected: VisitScript = [
				["enterField", rootKey],
				["exitField", rootKey],
				["enterField", rootKey],
				["create", [content], field0],
				["attach", field0, 1, 0],
				["exitField", rootKey],
			];
			testVisit(delta, expected, index);
			assert.equal(index.entries().next().done, true);
		});

		it("when the refreshed tree already exists in the forest", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const node = { minor: 42 };
			index.createEntry(node, 1);
			const rootFieldDelta: DeltaFieldChanges = {
				local: [{ count: 1, attach: node }],
			};
			const delta: DeltaRoot = {
				refreshers: [{ id: node, trees: [content] }],
				fields: new Map([[rootKey, rootFieldDelta]]),
			};
			const expected: VisitScript = [
				["enterField", rootKey],
				["exitField", rootKey],
				["enterField", rootKey],
				["attach", field0, 1, 0],
				["exitField", rootKey],
			];
			testVisit(delta, expected, index);
			assert.equal(index.entries().next().done, true);
		});

		it("when the refreshed tree is included in the builds", () => {
			const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
			const node = { minor: 42 };
			const rootFieldDelta: DeltaFieldChanges = {
				local: [{ count: 1, attach: node }],
			};
			const delta: DeltaRoot = {
				build: [{ id: node, trees: [content] }],
				refreshers: [{ id: node, trees: [content] }],
				fields: new Map([[rootKey, rootFieldDelta]]),
			};
			const expected: VisitScript = [
				["create", [content], field0],
				["enterField", rootKey],
				["exitField", rootKey],
				["enterField", rootKey],
				["attach", field0, 1, 0],
				["exitField", rootKey],
			];
			testVisit(delta, expected, index);
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
							? [
									["enterField", rootKey],
									["exitField", rootKey],
									["enterField", rootKey],
									["exitField", rootKey],
								]
							: [
									["enterField", rootKey],
									["exitField", rootKey],
									["enterField", field0],
									["detach", { start: 0, end: 1 }, field1],
									["exitField", field0],
									["enterField", rootKey],
									["exitField", rootKey],
								];
						testTreeVisit(delta, expected, index);
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
								["enterField", rootKey],
								["exitField", rootKey],
								["enterField", field0],
								["detach", { start: 0, end: 1 }, field1],
								["exitField", field0],
								["enterField", field1],
								["detach", { start: 0, end: 1 }, field2],
								["exitField", field1],
								["enterField", rootKey],
								["exitField", rootKey],
							];
							testTreeVisit(delta, expected, index);
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
								["enterField", rootKey],
								["exitField", rootKey],
								["enterField", field0],
								["detach", { start: 0, end: 1 }, field1],
								["exitField", field0],
								["enterField", field1],
								["detach", { start: 0, end: 1 }, field2],
								["exitField", field1],
								["enterField", field2],
								["detach", { start: 0, end: 1 }, field3],
								["exitField", field2],
								["enterField", rootKey],
								["exitField", rootKey],
							];
							const index = makeDetachedFieldIndex("", testRevisionTagCodec, testIdCompressor);
							index.createEntry(pointA);
							testTreeVisit(delta, expected, index);
							assert.deepEqual(Array.from(index.entries()), [{ id: end, root: 3 }]);
						});
					}
				});
			});
		}
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { leaf } from "../../domains";
import { cursorForJsonableTreeNode } from "../../feature-libraries";
import {
	FieldKey,
	Delta,
	DeltaVisitor,
	visitDelta,
	DetachedFieldIndex,
	makeDetachedFieldIndex,
	deltaForSet,
} from "../../core";
import { brand } from "../../util";
import { deepFreeze } from "../utils";

function visit(
	delta: Delta.Root,
	visitor: DeltaVisitor,
	detachedFieldIndex?: DetachedFieldIndex,
): void {
	deepFreeze(delta);
	visitDelta(delta, visitor, detachedFieldIndex ?? makeDetachedFieldIndex(""));
}

type CallSignatures<T> = {
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
	delta: Delta.Root,
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
	const visitor: DeltaVisitor = {} as any;
	for (const methodName of visitorMethods) {
		visitor[methodName] = makeChecker(methodName);
	}
	visit(delta, visitor, detachedFieldIndex);
	assert.deepEqual(result, expected);
}

function testTreeVisit(
	marks: Delta.FieldChanges,
	expected: Readonly<VisitScript>,
	detachedFieldIndex?: DetachedFieldIndex,
): void {
	testVisit({ fields: new Map([[rootKey, marks]]) }, expected, detachedFieldIndex);
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
		const index = makeDetachedFieldIndex("");
		testTreeVisit(
			deltaForSet(content, { minor: 42 }),
			[
				["enterField", rootKey],
				["create", [content], field0],
				["exitField", rootKey],
				["enterField", rootKey],
				["attach", field0, 1, 0],
				["exitField", rootKey],
			],
			index,
		);
		assert.equal(index.entries().next().done, true);
	});
	it("idempotent insert", () => {
		const index = makeDetachedFieldIndex("");
		const node = { minor: 42 };
		index.createEntry(node);
		testTreeVisit(
			deltaForSet(content, { minor: 42 }),
			[
				["enterField", rootKey],
				["exitField", rootKey],
				["enterField", rootKey],
				["attach", field0, 1, 0],
				["exitField", rootKey],
			],
			index,
		);
		assert.equal(index.entries().next().done, true);
	});
	it("insert child", () => {
		const index = makeDetachedFieldIndex("");
		const delta: Delta.FieldChanges = {
			local: [
				{
					count: 1,
					fields: new Map([[fooKey, deltaForSet(content, { minor: 42 })]]),
				},
			],
		};
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["create", [content], field0],
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
		testTreeVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("remove root", () => {
		const index = makeDetachedFieldIndex("");
		const mark: Delta.Mark = {
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
		const index = makeDetachedFieldIndex("");
		const remove: Delta.Mark = {
			count: 1,
			detach: { minor: 42 },
		};
		const mark: Delta.Mark = {
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
		const index = makeDetachedFieldIndex("");
		const moveId = { minor: 1 };
		const moveOut: Delta.Mark = {
			count: 1,
			detach: moveId,
		};
		const moveIn: Delta.Mark = {
			count: 1,
			attach: moveId,
		};
		const delta: Delta.FieldChanges = {
			build: [{ id: { minor: 43 }, trees: [content] }],
			global: [
				{
					id: { minor: 43 },
					fields: new Map([[fooKey, { local: [{ count: 42 }, moveOut, moveIn] }]]),
				},
			],
			local: [{ count: 1, attach: { minor: 43 } }],
		};
		const expected: VisitScript = [
			["enterField", rootKey],
			["create", [content], field0],
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
		testTreeVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("move node to the right", () => {
		const index = makeDetachedFieldIndex("");
		// start with 0123 then move 1 so the order is 0213
		const moveId = { minor: 1 };
		const moveOut: Delta.Mark = {
			count: 1,
			detach: moveId,
		};
		const moveIn: Delta.Mark = {
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
		const index = makeDetachedFieldIndex("");
		const moveId = { minor: 1 };
		const moveOut: Delta.Mark = {
			count: 2,
			detach: moveId,
		};
		const moveIn: Delta.Mark = {
			count: 2,
			attach: moveId,
		};
		const modify: Delta.Mark = {
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
		const index = makeDetachedFieldIndex("");
		const moveId = { minor: 1 };
		const moveOut: Delta.Mark = {
			count: 1,
			detach: moveId,
		};
		const moveIn: Delta.Mark = {
			count: 1,
			attach: moveId,
		};
		const modify: Delta.Mark = {
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
		const index = makeDetachedFieldIndex("");
		const moveId = { minor: 1 };
		const moveOut: Delta.Mark = {
			count: 1,
			detach: moveId,
		};
		const moveIn: Delta.Mark = {
			count: 1,
			attach: moveId,
		};
		const remove: Delta.Mark = {
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
		const index = makeDetachedFieldIndex("");
		const node1 = { minor: 42 };
		index.createEntry(node1);
		const moveId = { minor: 1 };
		const moveOut: Delta.Mark = {
			count: 1,
			detach: moveId,
		};
		const moveIn: Delta.Mark = {
			count: 1,
			attach: moveId,
		};
		const nested: Delta.DetachedNodeChanges = {
			id: node1,
			fields: new Map([[fooKey, { local: [moveOut, moveIn] }]]),
		};
		const delta: Delta.FieldChanges = {
			global: [nested],
			destroy: [{ id: node1, count: 1 }],
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
		testTreeVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("build-rename-destroy", () => {
		const index = makeDetachedFieldIndex("");
		const buildId = { minor: 42 };
		const detachId = { minor: 43 };
		const delta: Delta.FieldChanges = {
			build: [{ id: buildId, trees: [content] }],
			rename: [{ oldId: buildId, newId: detachId, count: 1 }],
			destroy: [{ id: detachId, count: 1 }],
		};
		const expected: VisitScript = [
			["enterField", rootKey],
			["create", [content], field0],
			["exitField", rootKey],
			["enterField", field0],
			["detach", { start: 0, end: 1 }, field1],
			["exitField", field0],
			["enterField", rootKey],
			["exitField", rootKey],
			["destroy", field1, 1],
		];
		testTreeVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("changes under move-out", () => {
		const index = makeDetachedFieldIndex("");
		const moveId1 = { minor: 1 };
		const moveId2 = { minor: 2 };
		const moveIn1: Delta.Mark = {
			count: 1,
			attach: moveId1,
		};
		const moveOut2: Delta.Mark = {
			count: 1,
			detach: moveId2,
		};
		const moveIn2: Delta.Mark = {
			count: 1,
			attach: moveId2,
		};
		const moveOut1: Delta.Mark = {
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
	it("changes under replaced node", () => {
		const index = makeDetachedFieldIndex("");
		const moveId1 = { minor: 1 };
		const moveId2 = { minor: 2 };
		const moveOut2: Delta.Mark = {
			count: 1,
			detach: moveId2,
		};
		const moveOut1: Delta.Mark = {
			count: 1,
			detach: moveId1,
		};
		const moveIn2: Delta.Mark = {
			count: 1,
			attach: moveId2,
		};
		const replace: Delta.Mark = {
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
		const index = makeDetachedFieldIndex("");
		const moveId1 = { minor: 1 };
		const moveId2 = { minor: 2 };
		const moveOut2: Delta.Mark = {
			count: 1,
			detach: moveId2,
		};
		const moveIn2: Delta.Mark = {
			count: 1,
			attach: moveId2,
		};
		const moveOut1: Delta.Mark = {
			count: 1,
			detach: moveId1,
			fields: new Map([[fooKey, { local: [moveOut2, moveIn2] }]]),
		};
		const replace: Delta.Mark = {
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
		const index = makeDetachedFieldIndex("");
		const delta: Delta.FieldChanges = {
			build: [{ id: { minor: 42 }, trees: [content] }],
			rename: [{ oldId: { minor: 42 }, count: 1, newId: { minor: 43 } }],
		};
		const expected: VisitScript = [
			["enterField", rootKey],
			["create", [content], field0],
			["exitField", rootKey],
			["enterField", field0],
			["detach", { start: 0, end: 1 }, field1],
			["exitField", field0],
			["enterField", rootKey],
			["exitField", rootKey],
		];
		testTreeVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [{ id: { minor: 43 }, root: 1 }]);
	});
	it("changes under transient", () => {
		const index = makeDetachedFieldIndex("");
		const moveId = { minor: 1 };
		const moveOut: Delta.Mark = {
			count: 1,
			detach: moveId,
		};
		const moveIn: Delta.Mark = {
			count: 1,
			attach: moveId,
		};
		const buildId = { minor: 42 };
		const detachId = { minor: 43 };
		const delta: Delta.FieldChanges = {
			build: [{ id: buildId, trees: [content] }],
			global: [{ id: buildId, fields: new Map([[barKey, { local: [moveOut, moveIn] }]]) }],
			rename: [{ oldId: buildId, count: 1, newId: detachId }],
		};
		const expected: VisitScript = [
			["enterField", rootKey],
			["create", [content], field0], // field0: buildId
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
		testTreeVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [{ id: detachId, root: 2 }]);
	});
	it("restore", () => {
		const index = makeDetachedFieldIndex("");
		const node1 = { minor: 1 };
		index.createEntry(node1);
		const restore: Delta.Mark = {
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
		const index = makeDetachedFieldIndex("");
		const node1 = { minor: 1 };
		index.createEntry(node1);
		const moveId = { minor: 2 };
		const rename: Delta.DetachedNodeRename = {
			count: 1,
			oldId: node1,
			newId: moveId,
		};
		const moveIn: Delta.Mark = {
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
		const index = makeDetachedFieldIndex("");
		const node1 = { minor: 1 };
		index.createEntry(node1);
		const moveId = { minor: 2 };
		const moveOut: Delta.Mark = {
			count: 1,
			detach: moveId,
		};
		const moveIn: Delta.Mark = {
			count: 1,
			attach: moveId,
		};
		const modify: Delta.DetachedNodeChanges = {
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
		const index = makeDetachedFieldIndex("");
		const moveId1 = { minor: 1 };
		const moveId2 = { minor: 2 };
		const detachId = { minor: 42 };
		const moveOut: Delta.Mark = {
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
		const moveIn: Delta.DetachedNodeRename = {
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
		const index = makeDetachedFieldIndex("");
		const node1 = { minor: 1 };
		index.createEntry(node1);
		const restore: Delta.DetachedNodeRename = {
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
		const index = makeDetachedFieldIndex("");
		const node1 = { minor: 1 };
		index.createEntry(node1);
		const buildId = { minor: 2 };
		const detachId = { minor: 42 };
		const renameOldNode: Delta.DetachedNodeRename = {
			count: 1,
			oldId: node1,
			newId: detachId,
		};
		const renameNewNode: Delta.DetachedNodeRename = {
			count: 1,
			oldId: buildId,
			newId: node1,
		};
		const delta = {
			build: [{ id: buildId, trees: [content] }],
			rename: [renameOldNode, renameNewNode],
		};
		const expected: VisitScript = [
			["enterField", rootKey],
			["create", [content], field1], // field1: buildId
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
		testTreeVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [
			{ id: detachId, root: 2 },
			{ id: node1, root: 3 },
		]);
	});
	describe("rename chains", () => {
		const pointA = { minor: 1 };
		for (const cycle of [false, true]) {
			describe(cycle ? "cyclic" : "acyclic", () => {
				const end = cycle ? pointA : { minor: 42 };
				describe("1-step", () => {
					it("Rename ordering: 1/1", () => {
						const index = makeDetachedFieldIndex("");
						index.createEntry(pointA);
						const rename: Delta.DetachedNodeRename = {
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
						assert.deepEqual(Array.from(index.entries()), [
							{ id: end, root: cycle ? 0 : 1 },
						]);
					});
				});
				describe("2-step", () => {
					for (let ordering = 1; ordering <= 2; ordering++) {
						it(`Rename ordering: ${ordering}/2`, () => {
							const index = makeDetachedFieldIndex("");
							index.createEntry(pointA);
							const pointB = { minor: 2 };
							const rename1: Delta.DetachedNodeRename = {
								count: 1,
								oldId: pointA,
								newId: pointB,
							};
							const rename2: Delta.DetachedNodeRename = {
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
							const ab: Delta.DetachedNodeRename = {
								count: 1,
								oldId: pointA,
								newId: pointB,
							};
							const bc: Delta.DetachedNodeRename = {
								count: 1,
								oldId: pointB,
								newId: pointC,
							};
							const cd: Delta.DetachedNodeRename = {
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
							const index = makeDetachedFieldIndex("");
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

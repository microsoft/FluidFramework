/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { jsonString } from "../../domains";
import { singleTextCursor } from "../../feature-libraries";
import {
	FieldKey,
	Delta,
	DeltaVisitor,
	visitDelta,
	TreeIndex,
	makeTreeIndex,
	DetachedRangeUpPath,
	DetachedPlaceUpPath,
} from "../../core";
import { brand } from "../../util";
import { deepFreeze } from "../utils";

function visit(delta: Delta.Root, visitor: DeltaVisitor, treeIndex?: TreeIndex): void {
	deepFreeze(delta);
	visitDelta(delta, visitor, treeIndex ?? makeTreeIndex(""));
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
	treeIndex?: TreeIndex,
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
	visit(delta, visitor, treeIndex);
	assert.deepEqual(result, expected);
}

function testTreeVisit(
	marks: Delta.MarkList,
	expected: Readonly<VisitScript>,
	treeIndex?: TreeIndex,
): void {
	testVisit(new Map([[rootKey, marks]]), expected, treeIndex);
}

const rootKey: FieldKey = brand("root");
const fooKey: FieldKey = brand("foo");
const barKey: FieldKey = brand("bar");
const nodeX = { type: jsonString.name, value: "X" };
const content = [singleTextCursor(nodeX)];
const field0: FieldKey = brand("-0");
const field1: FieldKey = brand("-1");
const field2: FieldKey = brand("-2");

describe("visit", () => {
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
		const mark: Delta.Insert = {
			type: Delta.MarkType.Insert,
			content,
		};
		const index = makeTreeIndex("");
		testTreeVisit(
			[mark],
			[
				["enterField", rootKey],
				["exitField", rootKey],
				["enterField", field0],
				["create", 0, content],
				["exitField", field0],
				["enterField", rootKey],
				["attach", brand<DetachedRangeUpPath>({ field: field0, start: 0, end: 1 }), 0],
				["exitField", rootKey],
			],
			index,
		);
		assert.equal(index.entries().next().done, true);
	});
	it("insert child", () => {
		const index = makeTreeIndex("");
		const mark = {
			type: Delta.MarkType.Insert,
			content,
		};
		const delta: Delta.MarkList = [
			{
				type: Delta.MarkType.Modify,
				fields: new Map([[fooKey, [42, mark]]]),
			},
		];
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
			["enterField", field0],
			["create", 0, content],
			["exitField", field0],
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["attach", brand<DetachedRangeUpPath>({ field: field0, start: 0, end: 1 }), 42],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
		];
		testTreeVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("remove root", () => {
		const index = makeTreeIndex("");
		const mark: Delta.Remove = {
			type: Delta.MarkType.Remove,
			count: 2,
			detachId: { minor: 42 },
		};
		testTreeVisit(
			[1, mark],
			[
				["enterField", rootKey],
				[
					"detach",
					{ start: 1, end: 2 },
					brand<DetachedPlaceUpPath>({ field: field0, index: 0 }),
				],
				[
					"detach",
					{ start: 1, end: 2 },
					brand<DetachedPlaceUpPath>({ field: field1, index: 0 }),
				],
				["exitField", rootKey],
				["enterField", rootKey],
				["exitField", rootKey],
			],
			index,
		);
		assert.deepEqual(Array.from(index.entries()), [
			{ field: field0, id: { minor: 42 }, root: 0 },
			{ field: field1, id: { minor: 43 }, root: 1 },
		]);
	});
	it("remove child", () => {
		const index = makeTreeIndex("");
		const mark: Delta.Remove = {
			type: Delta.MarkType.Remove,
			count: 1,
			detachId: { minor: 42 },
		};
		const delta: Delta.MarkList = [
			{
				type: Delta.MarkType.Modify,
				fields: new Map([[fooKey, [42, mark]]]),
			},
		];
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			[
				"detach",
				{ start: 42, end: 43 },
				brand<DetachedPlaceUpPath>({ field: field0, index: 0 }),
			],
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
		assert.deepEqual(Array.from(index.entries()), [
			{ field: field0, id: { minor: 42 }, root: 0 },
		]);
	});
	it("remove under insert", () => {
		const index = makeTreeIndex("");
		const remove: Delta.Remove = {
			type: Delta.MarkType.Remove,
			count: 1,
			detachId: { minor: 42 },
		};
		const delta: Delta.MarkList = [
			{
				type: Delta.MarkType.Insert,
				content,
				fields: new Map([[fooKey, [42, remove]]]),
			},
		];
		const expected: VisitScript = [
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", field0],
			["create", 0, content],
			["exitField", field0],
			["enterField", field0],
			["enterNode", 0],
			["enterField", fooKey],
			[
				"detach",
				{ start: 42, end: 43 },
				brand<DetachedPlaceUpPath>({ field: field1, index: 0 }),
			],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", field0],
			["enterField", rootKey],
			["attach", brand<DetachedRangeUpPath>({ field: field0, start: 0, end: 1 }), 0],
			["enterNode", 0],
			["enterField", fooKey],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
		];
		testTreeVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [
			{ field: field1, id: { minor: 42 }, root: 1 },
		]);
	});
	it("move node to the right", () => {
		const index = makeTreeIndex("");
		// start with 0123 then move 1 so the order is 0213
		const moveId: Delta.MoveId = brand(1);
		const moveOut: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			count: 1,
			moveId,
		};
		const moveIn: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			moveId,
		};
		const delta = [1, moveOut, 1, moveIn];
		const expected: VisitScript = [
			["enterField", rootKey],
			[
				"detach",
				{ start: 1, end: 2 },
				brand<DetachedPlaceUpPath>({ field: field0, index: 0 }),
			],
			["exitField", rootKey],
			["enterField", rootKey],
			["attach", brand<DetachedRangeUpPath>({ field: field0, start: 0, end: 1 }), 2],
			["exitField", rootKey],
		];
		testTreeVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("move children to the left", () => {
		const index = makeTreeIndex("");
		const moveId: Delta.MoveId = brand(1);
		const moveOut: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			count: 2,
			moveId,
		};
		const moveIn: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 2,
			moveId,
		};
		const delta = [
			{
				type: Delta.MarkType.Modify,
				fields: new Map([[fooKey, [2, moveIn, 3, moveOut]]]),
			},
		];
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			[
				"detach",
				{ start: 5, end: 6 },
				brand<DetachedPlaceUpPath>({ field: field0, index: 0 }),
			],
			[
				"detach",
				{ start: 5, end: 6 },
				brand<DetachedPlaceUpPath>({ field: field1, index: 0 }),
			],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["attach", brand<DetachedRangeUpPath>({ field: field0, start: 0, end: 1 }), 2],
			["attach", brand<DetachedRangeUpPath>({ field: field1, start: 0, end: 1 }), 3],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
		];
		testTreeVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("move cousins", () => {
		const index = makeTreeIndex("");
		const moveId: Delta.MoveId = brand(1);
		const moveOut: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			count: 1,
			moveId,
		};
		const moveIn: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			moveId,
		};
		const delta = [
			{
				type: Delta.MarkType.Modify,
				fields: new Map([
					[fooKey, [moveIn]],
					[barKey, [moveOut]],
				]),
			},
		];
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["exitField", fooKey],
			["enterField", barKey],
			[
				"detach",
				{ start: 0, end: 1 },
				brand<DetachedPlaceUpPath>({ field: field0, index: 0 }),
			],
			["exitField", barKey],
			["exitNode", 0],
			["exitField", rootKey],
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["attach", brand<DetachedRangeUpPath>({ field: field0, start: 0, end: 1 }), 0],
			["exitField", fooKey],
			["enterField", barKey],
			["exitField", barKey],
			["exitNode", 0],
			["exitField", rootKey],
		];
		testTreeVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("move-in under remove", () => {
		const index = makeTreeIndex("");
		const moveId: Delta.MoveId = brand(1);
		const moveOut: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			count: 1,
			moveId,
		};
		const moveIn: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			moveId,
		};
		const delta = [
			{
				type: Delta.MarkType.Remove,
				detachId: { minor: 42 },
				count: 1,
				fields: new Map([[fooKey, [moveIn]]]),
			},
			moveOut,
		];
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["exitField", fooKey],
			["exitNode", 0],
			[
				"detach",
				{ start: 0, end: 1 },
				brand<DetachedPlaceUpPath>({ field: field0, index: 0 }),
			],
			[
				"detach",
				{ start: 0, end: 1 },
				brand<DetachedPlaceUpPath>({ field: field1, index: 0 }),
			],
			["exitField", rootKey],
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", field0],
			["enterNode", 0],
			["enterField", fooKey],
			["attach", brand<DetachedRangeUpPath>({ field: field1, start: 0, end: 1 }), 0],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", field0],
		];
		testTreeVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [
			{ field: field0, id: { minor: 42 }, root: 0 },
		]);
	});
	it("move-out under remove", () => {
		const index = makeTreeIndex("");
		const moveId: Delta.MoveId = brand(1);
		const moveOut: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			count: 1,
			moveId,
		};
		const moveIn: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			moveId,
		};
		const delta = [
			{
				type: Delta.MarkType.Remove,
				detachId: { minor: 42 },
				count: 1,
				fields: new Map([[fooKey, [moveOut]]]),
			},
			moveIn,
		];
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			[
				"detach",
				{ start: 0, end: 1 },
				brand<DetachedPlaceUpPath>({ field: field1, index: 0 }),
			],
			["exitField", fooKey],
			["exitNode", 0],
			[
				"detach",
				{ start: 0, end: 1 },
				brand<DetachedPlaceUpPath>({ field: field0, index: 0 }),
			],
			["exitField", rootKey],
			["enterField", rootKey],
			["attach", brand<DetachedRangeUpPath>({ field: field1, start: 0, end: 1 }), 0],
			["exitField", rootKey],
			["enterField", field0],
			["enterNode", 0],
			["enterField", fooKey],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", field0],
		];
		testTreeVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [
			{ field: field0, id: { minor: 42 }, root: 0 },
		]);
	});
	it("move-in under move-out", () => {
		const index = makeTreeIndex("");
		const moveId1: Delta.MoveId = brand(1);
		const moveId2: Delta.MoveId = brand(2);
		const moveIn1: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			moveId: moveId1,
		};
		const moveOut2: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			count: 1,
			moveId: moveId2,
		};
		const moveIn2: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			moveId: moveId2,
		};
		const delta = [
			{
				type: Delta.MarkType.MoveOut,
				count: 1,
				moveId: moveId1,
				fields: new Map([[fooKey, [moveIn2]]]),
			},
			moveOut2,
			moveIn1,
		];
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["exitField", fooKey],
			["exitNode", 0],
			[
				"detach",
				{ start: 0, end: 1 },
				brand<DetachedPlaceUpPath>({ field: field0, index: 0 }),
			],
			[
				"detach",
				{ start: 0, end: 1 },
				brand<DetachedPlaceUpPath>({ field: field1, index: 0 }),
			],
			["exitField", rootKey],
			["enterField", rootKey],
			["attach", brand<DetachedRangeUpPath>({ field: field0, start: 0, end: 1 }), 0],
			["enterNode", 0],
			["enterField", fooKey],
			["attach", brand<DetachedRangeUpPath>({ field: field1, start: 0, end: 1 }), 0],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
		];
		testTreeVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("remove under move-out", () => {
		const index = makeTreeIndex("");
		const moveId1: Delta.MoveId = brand(1);
		const moveIn1: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			moveId: moveId1,
		};
		const remove: Delta.Remove = {
			type: Delta.MarkType.Remove,
			detachId: { minor: 42 },
			count: 1,
		};
		const delta = [
			{
				type: Delta.MarkType.MoveOut,
				moveId: moveId1,
				count: 1,
				fields: new Map([[fooKey, [remove]]]),
			},
			moveIn1,
		];
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			[
				"detach",
				{ start: 0, end: 1 },
				brand<DetachedPlaceUpPath>({ field: field1, index: 0 }),
			],
			["exitField", fooKey],
			["exitNode", 0],
			[
				"detach",
				{ start: 0, end: 1 },
				brand<DetachedPlaceUpPath>({ field: field0, index: 0 }),
			],
			["exitField", rootKey],
			["enterField", rootKey],
			["attach", brand<DetachedRangeUpPath>({ field: field0, start: 0, end: 1 }), 0],
			["enterNode", 0],
			["enterField", fooKey],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
		];
		testTreeVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [
			{ field: field1, id: { minor: 42 }, root: 1 },
		]);
	});
	it("transient insert", () => {
		const index = makeTreeIndex("");
		const mark: Delta.Insert = {
			type: Delta.MarkType.Insert,
			content,
			detachId: { minor: 42 },
		};
		const delta = [mark];
		const expected: VisitScript = [
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", field0],
			["create", 0, content],
			["exitField", field0],
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", field0],
			[
				"detach",
				{ start: 0, end: 1 },
				brand<DetachedPlaceUpPath>({ field: field1, index: 0 }),
			],
			["exitField", field0],
		];
		testTreeVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [
			{ field: field1, id: { minor: 42 }, root: 1 },
		]);
	});
	it("move-out under transient", () => {
		const index = makeTreeIndex("");
		const moveId: Delta.MoveId = brand(1);
		const moveOut: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			count: 1,
			moveId,
		};
		const moveIn: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			moveId,
		};
		const insert: Delta.Insert = {
			type: Delta.MarkType.Insert,
			content,
			detachId: { minor: 42 },
			fields: new Map([[barKey, [moveOut]]]),
		};
		const delta = [
			{
				type: Delta.MarkType.Modify,
				fields: new Map([
					[fooKey, [42, insert]],
					[barKey, [moveIn]],
				]),
			},
		];
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["exitField", fooKey],
			["enterField", barKey],
			["exitField", barKey],
			["exitNode", 0],
			["exitField", rootKey],
			["enterField", field0],
			["create", 0, content],
			["exitField", field0],
			["enterField", field0],
			["enterNode", 0],
			["enterField", barKey],
			[
				"detach",
				{ start: 0, end: 1 },
				brand<DetachedPlaceUpPath>({ field: field1, index: 0 }),
			],
			["exitField", barKey],
			["exitNode", 0],
			["exitField", field0],
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["exitField", fooKey],
			["enterField", barKey],
			["attach", brand<DetachedRangeUpPath>({ field: field1, start: 0, end: 1 }), 0],
			["exitField", barKey],
			["exitNode", 0],
			["exitField", rootKey],
			["enterField", field0],
			[
				"detach",
				{ start: 0, end: 1 },
				brand<DetachedPlaceUpPath>({ field: field2, index: 0 }),
			],
			["exitField", field0],
			["enterField", field2],
			["enterNode", 0],
			["enterField", barKey],
			["exitField", barKey],
			["exitNode", 0],
			["exitField", field2],
		];
		testTreeVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [
			{ field: field2, id: { minor: 42 }, root: 2 },
		]);
	});
	it("restore", () => {
		const index = makeTreeIndex("");
		const node1 = { minor: 1 };
		index.createEntry(node1);
		const restore: Delta.Restore = {
			type: Delta.MarkType.Restore,
			count: 1,
			newContent: { restoreId: node1 },
		};
		const delta = [restore];
		const expected: VisitScript = [
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", rootKey],
			["attach", brand<DetachedRangeUpPath>({ field: field0, start: 0, end: 1 }), 0],
			["exitField", rootKey],
		];
		testTreeVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("move removed node", () => {
		const index = makeTreeIndex("");
		const node1 = { minor: 1 };
		index.createEntry(node1);
		const moveOut: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			count: 1,
			moveId: brand(1),
			detachedNodeId: node1,
		};
		const moveIn: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			moveId: brand(1),
		};
		const delta = [moveOut, moveIn];
		const expected: VisitScript = [
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", field0],
			[
				"detach",
				{ start: 0, end: 1 },
				brand<DetachedPlaceUpPath>({ field: field1, index: 0 }),
			],
			["exitField", field0],
			["enterField", rootKey],
			["attach", brand<DetachedRangeUpPath>({ field: field1, start: 0, end: 1 }), 0],
			["exitField", rootKey],
		];
		testTreeVisit(delta, expected, index);
		assert.equal(index.entries().next().done, true);
	});
	it("modify removed node", () => {
		const index = makeTreeIndex("");
		const node1 = { minor: 1 };
		index.createEntry(node1);
		const moveOut: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			count: 1,
			moveId: brand(1),
		};
		const moveIn: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			moveId: brand(1),
		};
		const delta = [
			{
				type: Delta.MarkType.Modify,
				fields: new Map([[fooKey, [moveOut, moveIn]]]),
				detachedNodeId: { minor: 1 },
			},
		];
		const expected: VisitScript = [
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", field0],
			["enterNode", 0],
			["enterField", fooKey],
			[
				"detach",
				{ start: 0, end: 1 },
				brand<DetachedPlaceUpPath>({ field: field1, index: 0 }),
			],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", field0],
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", field0],
			["enterNode", 0],
			["enterField", fooKey],
			["attach", brand<DetachedRangeUpPath>({ field: field1, start: 0, end: 1 }), 0],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", field0],
		];
		testTreeVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [
			{ field: field0, id: { minor: 1 }, root: 0 },
		]);
	});
	it("transient move-in and modify", () => {
		const index = makeTreeIndex("");
		const moveOut: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			count: 1,
			moveId: brand(1),
			fields: new Map([
				[
					fooKey,
					[
						{
							type: Delta.MarkType.MoveOut,
							moveId: brand(2),
							count: 1,
						},
						{
							type: Delta.MarkType.MoveIn,
							count: 1,
							moveId: brand(2),
						},
					],
				],
			]),
		};
		const moveIn: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			moveId: brand(1),
			detachId: { minor: 42 },
		};
		const delta = [moveOut, moveIn];
		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			[
				"detach",
				{ start: 0, end: 1 },
				brand<DetachedPlaceUpPath>({ field: field1, index: 0 }),
			],
			["exitField", fooKey],
			["exitNode", 0],
			[
				"detach",
				{ start: 0, end: 1 },
				brand<DetachedPlaceUpPath>({ field: field0, index: 0 }),
			],
			["exitField", rootKey],
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", field0],
			[
				"detach",
				{ start: 0, end: 1 },
				brand<DetachedPlaceUpPath>({ field: field2, index: 0 }),
			],
			["exitField", field0],
			["enterField", field2],
			["enterNode", 0],
			["enterField", fooKey],
			["attach", brand<DetachedRangeUpPath>({ field: field1, start: 0, end: 1 }), 0],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", field2],
		];
		testTreeVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [
			{ field: field2, id: { minor: 42 }, root: 2 },
		]);
	});
	it("transient restore", () => {
		const index = makeTreeIndex("");
		const node1 = { minor: 1 };
		index.createEntry(node1);
		const restore: Delta.Restore = {
			type: Delta.MarkType.Restore,
			count: 1,
			newContent: { restoreId: node1, detachId: { minor: 42 } },
		};
		const delta = [restore];
		const expected: VisitScript = [
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", rootKey],
			["exitField", rootKey],
			["enterField", field0],
			[
				"detach",
				{ start: 0, end: 1 },
				brand<DetachedPlaceUpPath>({ field: field1, index: 0 }),
			],
			["exitField", field0],
		];
		testTreeVisit(delta, expected, index);
		assert.deepEqual(Array.from(index.entries()), [
			{ field: field1, id: { minor: 42 }, root: 1 },
		]);
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { jsonString } from "../../domains";
import { singleTextCursor } from "../../feature-libraries";
import { FieldKey, Delta, DeltaVisitor, visitDelta, rootFieldKeySymbol } from "../../core";
import { brand } from "../../util";
import { deepFreeze } from "../utils";

function visit(delta: Delta.Root, visitor: DeltaVisitor): void {
	deepFreeze(delta);
	visitDelta(delta, visitor);
}

type CallSignatures<T> = {
	[K in keyof T]: T[K] extends (...args: any) => any ? [K, ...Parameters<T[K]>] : never;
};
type PropType<T> = T[keyof T];
type VisitCall = PropType<CallSignatures<DeltaVisitor>>;
type VisitScript = VisitCall[];

const visitorMethods: (keyof DeltaVisitor)[] = [
	"onDelete",
	"onInsert",
	"onMoveOut",
	"onMoveIn",
	"onSetValue",
	"enterNode",
	"exitNode",
	"enterField",
	"exitField",
];

function testVisit(delta: Delta.Root, expected: Readonly<VisitScript>): void {
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
	visit(delta, visitor);
	assert.deepEqual(result, expected);
}

function testTreeVisit(marks: Delta.MarkList, expected: Readonly<VisitScript>): void {
	testVisit(new Map([[rootKey, marks]]), [
		["enterField", rootKey],
		...expected,
		["exitField", rootKey],
	]);
}

const rootKey: FieldKey = brand("root");
const fooKey: FieldKey = brand("foo");
const barKey: FieldKey = brand("bar");
const nodeX = { type: jsonString.name, value: "X" };
const content = [singleTextCursor(nodeX)];

describe("visit", () => {
	it("empty delta", () => {
		testTreeVisit([], []);
	});

	it("set root value", () => {
		const mark: Delta.Modify = {
			type: Delta.MarkType.Modify,
			setValue: 1,
		};
		const expected: VisitScript = [
			["enterNode", 0],
			["onSetValue", 1],
			["exitNode", 0],
		];
		testTreeVisit([mark], expected);
	});

	it("set child value", () => {
		const mark: Delta.Modify = {
			type: Delta.MarkType.Modify,
			setValue: 1,
		};
		const delta: Delta.MarkList = [
			{
				type: Delta.MarkType.Modify,
				fields: new Map([[fooKey, [42, mark]]]),
			},
		];
		const expected: VisitScript = [
			["enterNode", 0],
			["enterField", fooKey],
			["enterNode", 42],
			["onSetValue", 1],
			["exitNode", 42],
			["exitField", fooKey],
			["exitNode", 0],
		];
		testTreeVisit(delta, expected);
	});

	it("insert root", () => {
		const mark: Delta.Insert = {
			type: Delta.MarkType.Insert,
			content,
		};
		testTreeVisit([mark], [["onInsert", 0, content]]);
	});

	it("insert child", () => {
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
			["enterNode", 0],
			["enterField", fooKey],
			["onInsert", 42, content],
			["exitField", fooKey],
			["exitNode", 0],
		];
		testTreeVisit(delta, expected);
	});

	it("delete root", () => {
		const mark: Delta.Delete = {
			type: Delta.MarkType.Delete,
			count: 10,
		};
		testTreeVisit(
			[mark],
			[
				["exitField", rootKey],
				["enterField", rootKey],
				["onDelete", 0, 10],
			],
		);
	});

	it("delete child", () => {
		const mark: Delta.Delete = {
			type: Delta.MarkType.Delete,
			count: 10,
		};
		const delta: Delta.MarkList = [
			{
				type: Delta.MarkType.Modify,
				fields: new Map([[fooKey, [42, mark]]]),
			},
		];
		const expected: VisitScript = [
			["enterNode", 0],
			["enterField", fooKey],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["onDelete", 42, 10],
			["exitField", fooKey],
			["exitNode", 0],
		];
		testTreeVisit(delta, expected);
	});

	it("the lot on a field", () => {
		const del: Delta.Delete = {
			type: Delta.MarkType.Delete,
			count: 10,
		};
		const ins: Delta.Insert = {
			type: Delta.MarkType.Insert,
			content,
		};
		const set: Delta.Modify = {
			type: Delta.MarkType.Modify,
			setValue: 1,
		};
		const delta: Delta.MarkList = [
			{
				type: Delta.MarkType.Modify,
				fields: new Map([[fooKey, [del, 3, ins, 1, set]]]),
			},
		];
		const expected: VisitScript = [
			["enterNode", 0],
			["enterField", fooKey],
			["onInsert", 13, content],
			["enterNode", 15],
			["onSetValue", 1],
			["exitNode", 15],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["onDelete", 0, 10],
			["exitField", fooKey],
			["exitNode", 0],
		];
		testTreeVisit(delta, expected);
	});

	it("move node to the right", () => {
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

		const delta = new Map([[rootFieldKeySymbol, [1, moveOut, 1, moveIn]]]);

		const expected: VisitScript = [
			["enterField", rootFieldKeySymbol],
			["onMoveOut", 1, 1, moveId],

			// TODO: optimize out needless exit then enter
			["exitField", rootFieldKeySymbol],
			["enterField", rootFieldKeySymbol],

			["onMoveIn", 2, 1, moveId],
			["exitField", rootFieldKeySymbol],
		];

		testVisit(delta, expected);
	});

	it("move children to the right", () => {
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

		const delta: Delta.Root = new Map([
			[
				rootKey,
				[
					{
						type: Delta.MarkType.Modify,
						fields: new Map([[fooKey, [2, moveOut, 3, moveIn]]]),
					},
				],
			],
		]);

		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["onMoveOut", 2, 2, moveId],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["onMoveIn", 5, 2, moveId],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
		];

		testVisit(delta, expected);
	});

	it("move children to the left", () => {
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

		const delta: Delta.Root = new Map([
			[
				rootKey,
				[
					{
						type: Delta.MarkType.Modify,
						fields: new Map([[fooKey, [2, moveIn, 3, moveOut]]]),
					},
				],
			],
		]);

		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["onMoveOut", 5, 2, moveId],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["onMoveIn", 2, 2, moveId],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
		];

		testVisit(delta, expected);
	});

	it("modify and move children", () => {
		const moveId: Delta.MoveId = brand(1);
		const moveOut: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			count: 1,
			setValue: 42,
			moveId,
		};

		const moveIn: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			moveId,
		};

		const delta: Delta.Root = new Map([
			[
				rootKey,
				[
					{
						type: Delta.MarkType.Modify,
						fields: new Map([[fooKey, [2, moveIn, 4, moveOut]]]),
					},
				],
			],
		]);

		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["enterNode", 6],
			["onSetValue", 42],
			["exitNode", 6],
			["onMoveOut", 6, 1, moveId],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["onMoveIn", 2, 1, moveId],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
		];

		testVisit(delta, expected);
	});

	it("move cousins", () => {
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

		const delta: Delta.Root = new Map([
			[
				rootKey,
				[
					{
						type: Delta.MarkType.Modify,
						fields: new Map([
							[fooKey, [moveIn]],
							[barKey, [moveOut]],
						]),
					},
				],
			],
		]);

		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["exitField", fooKey],
			["enterField", barKey],
			["onMoveOut", 0, 2, moveId],
			["exitField", barKey],
			["exitNode", 0],
			["exitField", rootKey],
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["onMoveIn", 0, 2, moveId],
			["exitField", fooKey],
			["enterField", barKey],
			["exitField", barKey],
			["exitNode", 0],
			["exitField", rootKey],
		];

		testVisit(delta, expected);
	});

	it("move in under delete", () => {
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

		const delta: Delta.Root = new Map([
			[
				rootKey,
				[
					{
						type: Delta.MarkType.Delete,
						count: 1,
						fields: new Map([[fooKey, [moveIn]]]),
					},
					moveOut,
				],
			],
		]);

		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["exitField", fooKey],
			["exitNode", 0],
			["onMoveOut", 1, 2, moveId],
			["exitField", rootKey],
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["onMoveIn", 0, 2, moveId],
			["exitField", fooKey],
			["exitNode", 0],
			["onDelete", 0, 1],
			["exitField", rootKey],
		];

		testVisit(delta, expected);
	});

	it("move in under move-out", () => {
		const moveId1: Delta.MoveId = brand(1);
		const moveId2: Delta.MoveId = brand(2);

		const moveIn1: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			moveId: moveId1,
		};

		const moveOut2: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			count: 2,
			moveId: moveId2,
		};

		const moveIn2: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 2,
			moveId: moveId2,
		};

		const delta: Delta.Root = new Map([
			[
				rootKey,
				[
					{
						type: Delta.MarkType.MoveOut,
						count: 1,
						moveId: moveId1,
						fields: new Map([[fooKey, [moveIn2]]]),
					},
					moveOut2,
					moveIn1,
				],
			],
		]);

		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["exitField", fooKey],
			["exitNode", 0],
			["onMoveOut", 0, 1, moveId1],
			["onMoveOut", 0, 2, moveId2],
			["exitField", rootKey],
			["enterField", rootKey],
			["onMoveIn", 0, 1, moveId1],
			["enterNode", 0],
			["enterField", fooKey],
			["onMoveIn", 0, 2, moveId2],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
		];

		testVisit(delta, expected);
	});

	it("delete under move-out", () => {
		const moveId1: Delta.MoveId = brand(1);

		const moveIn1: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			moveId: moveId1,
		};

		const del: Delta.Delete = {
			type: Delta.MarkType.Delete,
			count: 2,
		};

		const delta: Delta.Root = new Map([
			[
				rootKey,
				[
					{
						type: Delta.MarkType.MoveOut,
						moveId: moveId1,
						count: 1,
						fields: new Map([[fooKey, [del]]]),
					},
					moveIn1,
				],
			],
		]);

		const expected: VisitScript = [
			["enterField", rootKey],
			["enterNode", 0],
			["enterField", fooKey],
			["exitField", fooKey],
			["exitNode", 0],
			["onMoveOut", 0, 1, moveId1],
			["exitField", rootKey],
			["enterField", rootKey],
			["onMoveIn", 0, 1, moveId1],
			["enterNode", 0],
			["enterField", fooKey],
			["onDelete", 0, 2],
			["exitField", fooKey],
			["exitNode", 0],
			["exitField", rootKey],
		];

		testVisit(delta, expected);
	});
});

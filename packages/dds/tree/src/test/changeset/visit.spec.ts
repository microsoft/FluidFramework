/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Value } from "../..";
import { Delta, DeltaVisitor, visitDelta } from "../../changeset";
import { deepFreeze } from "../utils";

function visit(delta: Delta.Root, visitor: DeltaVisitor): void {
	deepFreeze(delta);
	visitDelta(delta, visitor);
}

type VisitScript = VisitCall[];

type VisitCall =
	| ["onDelete", number, Delta.Delete]
	| ["onInsert", number, Delta.Insert]
	| ["onMoveOut", number, Delta.MoveOut]
	| ["onMoveIn", number, Delta.MoveIn]
	| ["onSetValue", Value]
	| ["enterNode", number]
	| ["exitNode", number]
	| ["enterField", Delta.FieldKey]
	| ["exitField", Delta.FieldKey];

function testVisit(delta: Delta.Root, expected: Readonly<VisitScript>): void {
	let callIndex = 0;
	const visitor = {
		onDelete: (index: number, mark: Delta.Delete): void => {
			assert.deepStrictEqual(["onDelete", index, mark], expected[callIndex]);
			callIndex += 1;
		},
		onInsert: (index: number, mark: Delta.Insert): void => {
			assert.deepStrictEqual(["onInsert", index, mark], expected[callIndex]);
			callIndex += 1;
		},
		onMoveOut: (index: number, mark: Delta.MoveOut): void => {
			assert.deepStrictEqual(["onMoveOut", index, mark], expected[callIndex]);
			callIndex += 1;
		},
		onMoveIn: (index: number, mark: Delta.MoveIn): void => {
			assert.deepStrictEqual(["onMoveIn", index, mark], expected[callIndex]);
			callIndex += 1;
		},
		onSetValue: (value: Delta.Value): void => {
			assert.deepStrictEqual(["onSetValue", value], expected[callIndex]);
			callIndex += 1;
		},
		enterNode: (index: number): void => {
			assert.deepStrictEqual(["enterNode", index], expected[callIndex]);
			callIndex += 1;
		},
		exitNode: (index: number): void => {
			assert.deepStrictEqual(["exitNode", index], expected[callIndex]);
			callIndex += 1;
		},
		enterField: (key: Delta.FieldKey): void => {
			assert.deepStrictEqual(["enterField", key], expected[callIndex]);
			callIndex += 1;
		},
		exitField: (key: Delta.FieldKey): void => {
			assert.deepStrictEqual(["exitField", key], expected[callIndex]);
			callIndex += 1;
		},
	};
	visit(delta, visitor);
	assert.strictEqual(callIndex, expected.length);
}

const empty: Delta.Root = [];

describe("visit", () => {
	it("empty delta", () => {
		testVisit([], []);
	});

	it("set root value", () => {
		const mark: Delta.Modify = {
			[Delta.type]: Delta.MarkType.Modify,
			[Delta.setValue]: 1,
		};
		const expected: VisitScript = [
			["enterNode", 0],
			["onSetValue", 1],
			["exitNode", 0],
		];
		testVisit([{ offset: 0, mark }], expected);
	});

	it("set child value", () => {
		const mark: Delta.Modify = {
			[Delta.type]: Delta.MarkType.Modify,
			[Delta.setValue]: 1,
		};
		const delta: Delta.Root = [{
			offset: 0,
			mark: {
				[Delta.type]: Delta.MarkType.Modify,
				foo: [{ offset: 42, mark }],
			},
		}];
		const expected: VisitScript = [
			["enterNode", 0],
			["enterField", "foo"],
			["enterNode", 42],
			["onSetValue", 1],
			["exitNode", 42],
			["exitField", "foo"],
			["exitNode", 0],
		];
		testVisit(delta, expected);
	});

	it("insert root", () => {
		const mark: Delta.Insert = {
			[Delta.type]: Delta.MarkType.Insert,
			content: [{ id: "X" }],
		};
		testVisit([{ offset: 0, mark }], [["onInsert", 0, mark]]);
	});

	it("insert child", () => {
		const mark: Delta.Insert = {
			[Delta.type]: Delta.MarkType.Insert,
			content: [{ id: "X" }],
		};
		const delta: Delta.Root = [{
			offset: 0,
			mark: {
				[Delta.type]: Delta.MarkType.Modify,
				foo: [{ offset: 42, mark }],
			},
		}];
		const expected: VisitScript = [
			["enterNode", 0],
			["enterField", "foo"],
			["onInsert", 42, mark],
			["exitField", "foo"],
			["exitNode", 0],
		];
		testVisit(delta, expected);
	});

	it("delete root", () => {
		const mark: Delta.Delete = {
			[Delta.type]: Delta.MarkType.Delete,
			count: 10,
		};
		testVisit([{ offset: 0, mark }], [["onDelete", 0, mark]]);
	});

	it("delete child", () => {
		const mark: Delta.Delete = {
			[Delta.type]: Delta.MarkType.Delete,
			count: 10,
		};
		const delta: Delta.Root = [{
			offset: 0,
			mark: {
				[Delta.type]: Delta.MarkType.Modify,
				foo: [{ offset: 42, mark }],
			},
		}];
		const expected: VisitScript = [
			["enterNode", 0],
			["enterField", "foo"],
			["onDelete", 42, mark],
			["exitField", "foo"],
			["exitNode", 0],
		];
		testVisit(delta, expected);
	});

	it("the lot on a field", () => {
		const del: Delta.Delete = {
			[Delta.type]: Delta.MarkType.Delete,
			count: 10,
		};
		const ins: Delta.Insert = {
			[Delta.type]: Delta.MarkType.Insert,
			content: [{ id: "X" }],
		};
		const set: Delta.Modify = {
			[Delta.type]: Delta.MarkType.Modify,
			[Delta.setValue]: 1,
		};
		const delta: Delta.Root = [{
			offset: 0,
			mark: {
				[Delta.type]: Delta.MarkType.Modify,
				foo: [
					{ offset: 0, mark: del },
					{ offset: 3, mark: ins },
					{ offset: 1, mark: set },
				],
			},
		}];
		const expected: VisitScript = [
			["enterNode", 0],
			["enterField", "foo"],
			["onDelete", 0, del],
			["onInsert", 3, ins],
			["enterNode", 5],
			["onSetValue", 1],
			["exitNode", 5],
			["exitField", "foo"],
			["exitNode", 0],
		];
		testVisit(delta, expected);
	});
});

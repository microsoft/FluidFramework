/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { RevisionTag, TreeSchemaIdentifier } from "../../../core";
import { SequenceField as SF } from "../../../feature-libraries";
import { brand } from "../../../util";

const dummyMark: SF.Detach = { type: "Delete", count: 1 };
const type: TreeSchemaIdentifier = brand("Node");
const detachedBy: RevisionTag = brand(42);

describe("SequenceField - MarkListFactory", () => {
	it("Inserts an offset when there is content after the offset", () => {
		const factory = new SF.MarkListFactory();
		factory.pushOffset(42);
		factory.pushContent(dummyMark);
		assert.deepStrictEqual(factory.list, [42, dummyMark]);
	});

	it("Does not insert 0-length offsets", () => {
		const factory = new SF.MarkListFactory();
		factory.pushOffset(0);
		factory.pushContent(dummyMark);
		assert.deepStrictEqual(factory.list, [dummyMark]);
	});

	it("Merges runs of offsets into a single offset", () => {
		const factory = new SF.MarkListFactory();
		factory.pushOffset(42);
		factory.pushOffset(42);
		factory.pushContent(dummyMark);
		assert.deepStrictEqual(factory.list, [84, dummyMark]);
	});

	it("Does not insert an offset when there is no content after the offset", () => {
		const factory = new SF.MarkListFactory();
		factory.pushContent(dummyMark);
		factory.pushOffset(42);
		factory.pushOffset(42);
		assert.deepStrictEqual(factory.list, [dummyMark]);
	});

	it("Can merge consecutive inserts", () => {
		const factory = new SF.MarkListFactory();
		const insert1: SF.Insert = { type: "Insert", content: [{ type, value: 1 }] };
		const insert2: SF.Insert = { type: "Insert", content: [{ type, value: 2 }] };
		factory.pushContent(insert1);
		factory.pushContent(insert2);
		assert.deepStrictEqual(factory.list, [
			{
				type: "Insert",
				content: [
					{ type, value: 1 },
					{ type, value: 2 },
				],
			},
		]);
	});

	it("Can merge consecutive deletes", () => {
		const factory = new SF.MarkListFactory();
		const delete1: SF.Detach = { type: "Delete", count: 1 };
		const delete2: SF.Detach = { type: "Delete", count: 1 };
		factory.pushContent(delete1);
		factory.pushContent(delete2);
		assert.deepStrictEqual(factory.list, [{ type: "Delete", count: 2 }]);
	});

	it("Can merge adjacent moves ", () => {
		const moveEffects = SF.newMoveEffectTable();
		const factory1 = new SF.MarkListFactory(undefined, moveEffects);
		const moveOut1: SF.Detach = { type: "MoveOut", id: brand(0), count: 1 };
		const moveOut2: SF.Detach = { type: "MoveOut", id: brand(1), count: 1 };
		const moveIn1: SF.Mark = { type: "MoveIn", id: brand(0), count: 1 };
		const moveIn2: SF.Mark = { type: "MoveIn", id: brand(1), count: 1 };
		factory1.pushContent(moveOut1);
		factory1.pushContent(moveOut2);
		factory1.pushOffset(3);
		factory1.pushContent(moveIn1);
		factory1.pushContent(moveIn2);

		const factory2 = new SF.MarkListFactory(undefined, moveEffects);
		for (const mark of factory1.list) {
			factory2.push(mark);
		}

		assert.deepStrictEqual(factory2.list, [
			{ type: "MoveOut", id: 0, count: 2 },
			3,
			{ type: "MoveIn", id: 0, count: 2 },
		]);
	});

	it("Can merge three adjacent moves ", () => {
		const moveEffects = SF.newMoveEffectTable();
		const factory1 = new SF.MarkListFactory(undefined, moveEffects);
		const moveOut1: SF.Detach = { type: "MoveOut", id: brand(0), count: 1 };
		const moveOut2: SF.Detach = { type: "MoveOut", id: brand(1), count: 1 };
		const moveOut3: SF.Detach = { type: "MoveOut", id: brand(2), count: 1 };
		const moveIn1: SF.Mark = { type: "MoveIn", id: brand(0), count: 1 };
		const moveIn2: SF.Mark = { type: "MoveIn", id: brand(1), count: 1 };
		const moveIn3: SF.Mark = { type: "MoveIn", id: brand(2), count: 1 };
		factory1.pushContent(moveOut1);
		factory1.pushContent(moveOut2);
		factory1.pushContent(moveOut3);
		factory1.pushOffset(3);
		factory1.pushContent(moveIn1);
		factory1.pushContent(moveIn2);
		factory1.pushContent(moveIn3);

		const factory2 = new SF.MarkListFactory(undefined, moveEffects);
		for (const mark of factory1.list) {
			factory2.push(mark);
		}

		assert.deepStrictEqual(factory2.list, [
			{ type: "MoveOut", id: 0, count: 3 },
			3,
			{ type: "MoveIn", id: 0, count: 3 },
		]);
	});

	it("Can merge consecutive revives", () => {
		const factory = new SF.MarkListFactory();
		const revive1: SF.Reattach = {
			type: "Revive",
			detachedBy,
			detachIndex: 0,
			count: 1,
		};
		const revive2: SF.Reattach = {
			type: "Revive",
			detachedBy,
			detachIndex: 1,
			count: 1,
		};
		factory.pushContent(revive1);
		factory.pushContent(revive2);
		const expected: SF.Reattach = {
			type: "Revive",
			detachedBy,
			detachIndex: 0,
			count: 2,
		};
		assert.deepStrictEqual(factory.list, [expected]);
	});

	it("Does not merge revives with gaps", () => {
		const factory = new SF.MarkListFactory();
		const revive1: SF.Reattach = {
			type: "Revive",
			detachedBy,
			detachIndex: 0,
			count: 1,
		};
		const revive2: SF.Reattach = {
			type: "Revive",
			detachedBy,
			detachIndex: 2,
			count: 1,
		};
		factory.pushContent(revive1);
		factory.pushContent(revive2);
		assert.deepStrictEqual(factory.list, [revive1, revive2]);
	});
});

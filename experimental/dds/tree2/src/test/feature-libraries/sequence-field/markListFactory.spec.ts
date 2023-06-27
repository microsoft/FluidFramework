/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { mintRevisionTag, RevisionTag, TreeSchemaIdentifier } from "../../../core";
import { ChangesetLocalId, NodeChangeset, SequenceField as SF } from "../../../feature-libraries";
import { brand } from "../../../util";
import { fakeTaggedRepair as fakeRepair } from "../../utils";

const dummyMark: SF.Detach = { type: "Delete", count: 1 };
const type: TreeSchemaIdentifier = brand("Node");
const detachedBy: RevisionTag = mintRevisionTag();

describe("SequenceField - MarkListFactory", () => {
	it("Inserts an offset when there is content after the offset", () => {
		const factory = new SF.MarkListFactory();
		factory.pushOffset(42);
		factory.pushContent(dummyMark);
		assert.deepStrictEqual(factory.list, [{ count: 42 }, dummyMark]);
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
		assert.deepStrictEqual(factory.list, [{ count: 84 }, dummyMark]);
	});

	it("Does not insert an offset when there is no content after the offset", () => {
		const factory = new SF.MarkListFactory();
		factory.pushContent(dummyMark);
		factory.pushOffset(42);
		factory.pushOffset(42);
		assert.deepStrictEqual(factory.list, [dummyMark]);
	});

	it("Can merge consecutive inserts", () => {
		const id1: ChangesetLocalId = brand(1);
		const id2: ChangesetLocalId = brand(2);
		const factory = new SF.MarkListFactory();
		const insert1: SF.Insert = { type: "Insert", content: [{ type, value: 1 }], id: id1 };
		const insert2: SF.Insert = { type: "Insert", content: [{ type, value: 2 }], id: id2 };
		factory.pushContent(insert1);
		factory.pushContent(insert2);
		assert.deepStrictEqual(factory.list, [
			{
				type: "Insert",
				content: [
					{ type, value: 1 },
					{ type, value: 2 },
				],
				id: id1,
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
		const moveEffects = SF.newMoveEffectTable<NodeChangeset>();
		const factory = new SF.MarkListFactory();
		const moveOut1: SF.Detach = { type: "MoveOut", id: brand(0), count: 1 };
		const moveOut2: SF.Detach = { type: "MoveOut", id: brand(1), count: 1 };
		const moveIn1: SF.Mark = { type: "MoveIn", id: brand(0), count: 1 };
		const moveIn2: SF.Mark = { type: "MoveIn", id: brand(1), count: 1 };
		factory.pushContent(moveOut1);
		factory.pushContent(moveOut2);
		factory.pushOffset(3);
		factory.pushContent(moveIn1);
		factory.pushContent(moveIn2);

		assert.deepStrictEqual(factory.list, [
			{ type: "MoveOut", id: 0, count: 2 },
			{ count: 3 },
			{ type: "MoveIn", id: 0, count: 2 },
		]);
	});

	it("Can merge three adjacent moves ", () => {
		const moveEffects = SF.newMoveEffectTable<NodeChangeset>();
		const factory = new SF.MarkListFactory();
		const moveOut1: SF.Detach = { type: "MoveOut", id: brand(0), count: 1 };
		const moveOut2: SF.Detach = { type: "MoveOut", id: brand(1), count: 1 };
		const moveOut3: SF.Detach = { type: "MoveOut", id: brand(2), count: 1 };
		const moveIn1: SF.Mark = { type: "MoveIn", id: brand(0), count: 1 };
		const moveIn2: SF.Mark = { type: "MoveIn", id: brand(1), count: 1 };
		const moveIn3: SF.Mark = { type: "MoveIn", id: brand(2), count: 1 };
		factory.pushContent(moveOut1);
		factory.pushContent(moveOut2);
		factory.pushContent(moveOut3);
		factory.pushOffset(3);
		factory.pushContent(moveIn1);
		factory.pushContent(moveIn2);
		factory.pushContent(moveIn3);

		assert.deepStrictEqual(factory.list, [
			{ type: "MoveOut", id: 0, count: 3 },
			{ count: 3 },
			{ type: "MoveIn", id: 0, count: 3 },
		]);
	});

	it("Can merge consecutive revives", () => {
		const factory = new SF.MarkListFactory();
		const revive1: SF.Reattach = {
			type: "Revive",
			detachEvent: { revision: detachedBy, index: 0 },
			content: fakeRepair(detachedBy, 0, 1),
			count: 1,
		};
		const revive2: SF.Reattach = {
			type: "Revive",
			detachEvent: { revision: detachedBy, index: 1 },
			content: fakeRepair(detachedBy, 1, 1),
			count: 1,
		};
		factory.pushContent(revive1);
		factory.pushContent(revive2);
		const expected: SF.Reattach = {
			type: "Revive",
			detachEvent: { revision: detachedBy, index: 0 },
			content: fakeRepair(detachedBy, 0, 2),
			count: 2,
		};
		assert.deepStrictEqual(factory.list, [expected]);
	});

	it("Does not merge revives with gaps", () => {
		const factory = new SF.MarkListFactory();
		const revive1: SF.Reattach = {
			type: "Revive",
			detachEvent: { revision: detachedBy, index: 0 },
			content: fakeRepair(detachedBy, 0, 1),
			count: 1,
		};
		const revive2: SF.Reattach = {
			type: "Revive",
			detachEvent: { revision: detachedBy, index: 2 },
			content: fakeRepair(detachedBy, 2, 1),
			count: 1,
		};
		factory.pushContent(revive1);
		factory.pushContent(revive2);
		assert.deepStrictEqual(factory.list, [revive1, revive2]);
	});
});

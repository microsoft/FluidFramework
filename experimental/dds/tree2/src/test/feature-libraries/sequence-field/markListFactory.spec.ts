/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { mintRevisionTag, RevisionTag, TreeSchemaIdentifier } from "../../../core";
import { ChangesetLocalId, SequenceField as SF } from "../../../feature-libraries";
import { brand } from "../../../util";
import { fakeTaggedRepair as fakeRepair } from "../../utils";
import { MarkMaker as Mark } from "./testEdits";

const dummyMark = Mark.delete(1, brand(0));
const type: TreeSchemaIdentifier = brand("Node");
const detachedBy: RevisionTag = mintRevisionTag();

describe("SequenceField - MarkListFactory", () => {
	it("Inserts an offset when there is content after the offset", () => {
		const factory = new SF.MarkListFactory();
		factory.pushOffset(42);
		factory.pushMark(dummyMark);
		assert.deepStrictEqual(factory.list, [{ count: 42 }, dummyMark]);
	});

	it("Does not insert 0-length offsets", () => {
		const factory = new SF.MarkListFactory();
		factory.pushOffset(0);
		factory.pushMark(dummyMark);
		assert.deepStrictEqual(factory.list, [dummyMark]);
	});

	it("Merges runs of offsets into a single offset", () => {
		const factory = new SF.MarkListFactory();
		factory.pushOffset(42);
		factory.pushOffset(42);
		factory.pushMark(dummyMark);
		assert.deepStrictEqual(factory.list, [{ count: 84 }, dummyMark]);
	});

	it("Does not insert an offset when there is no content after the offset", () => {
		const factory = new SF.MarkListFactory();
		factory.pushMark(dummyMark);
		factory.pushOffset(42);
		factory.pushOffset(42);
		assert.deepStrictEqual(factory.list, [dummyMark]);
	});

	it("Can merge consecutive inserts", () => {
		const id1: ChangesetLocalId = brand(1);
		const id2: ChangesetLocalId = brand(2);
		const factory = new SF.MarkListFactory();
		const insert1 = Mark.insert([{ type, value: 1 }], id1);
		const insert2 = Mark.insert([{ type, value: 2 }], id2);
		factory.pushMark(insert1);
		factory.pushMark(insert2);
		assert.deepStrictEqual(factory.list, [
			Mark.insert(
				[
					{ type, value: 1 },
					{ type, value: 2 },
				],
				id1,
			),
		]);
	});

	it("Can merge consecutive deletes", () => {
		const factory = new SF.MarkListFactory();
		const delete1 = Mark.delete(1, brand(0));
		const delete2 = Mark.delete(1, brand(1));
		factory.pushMark(delete1);
		factory.pushMark(delete2);
		assert.deepStrictEqual(factory.list, [Mark.delete(2, brand(0))]);
	});

	it("Can merge adjacent moves ", () => {
		const factory = new SF.MarkListFactory();
		const moveOut1 = Mark.moveOut(1, brand(0));
		const moveOut2 = Mark.moveOut(1, brand(1));
		const moveIn1 = Mark.moveIn(1, brand(0));
		const moveIn2 = Mark.moveIn(1, brand(1));
		factory.pushMark(moveOut1);
		factory.pushMark(moveOut2);
		factory.pushOffset(3);
		factory.pushMark(moveIn1);
		factory.pushMark(moveIn2);

		assert.deepStrictEqual(factory.list, [
			Mark.moveOut(2, brand(0)),
			{ count: 3 },
			Mark.moveIn(2, brand(0)),
		]);
	});

	it("Can merge three adjacent moves ", () => {
		const factory = new SF.MarkListFactory();
		const moveOut1 = Mark.moveOut(1, brand(0));
		const moveOut2 = Mark.moveOut(1, brand(1));
		const moveOut3 = Mark.moveOut(1, brand(2));
		const moveIn1 = Mark.moveIn(1, brand(0));
		const moveIn2 = Mark.moveIn(1, brand(1));
		const moveIn3 = Mark.moveIn(1, brand(2));
		factory.pushMark(moveOut1);
		factory.pushMark(moveOut2);
		factory.pushMark(moveOut3);
		factory.pushOffset(3);
		factory.pushMark(moveIn1);
		factory.pushMark(moveIn2);
		factory.pushMark(moveIn3);

		assert.deepStrictEqual(factory.list, [
			Mark.moveOut(3, brand(0)),
			{ count: 3 },
			Mark.moveIn(3, brand(0)),
		]);
	});

	it("Can merge consecutive revives", () => {
		const factory = new SF.MarkListFactory();
		const revive1 = Mark.revive(fakeRepair(detachedBy, 0, 1), {
			revision: detachedBy,
			localId: brand(0),
		});
		const revive2 = Mark.revive(fakeRepair(detachedBy, 1, 1), {
			revision: detachedBy,
			localId: brand(1),
		});
		factory.pushMark(revive1);
		factory.pushMark(revive2);
		const expected = Mark.revive(fakeRepair(detachedBy, 0, 2), {
			revision: detachedBy,
			localId: brand(0),
		});
		assert.deepStrictEqual(factory.list, [expected]);
	});

	it("Does not merge revives with gaps", () => {
		const factory = new SF.MarkListFactory();
		const revive1 = Mark.revive(fakeRepair(detachedBy, 0, 1), {
			revision: detachedBy,
			localId: brand(0),
		});
		const revive2 = Mark.revive(fakeRepair(detachedBy, 2, 1), {
			revision: detachedBy,
			localId: brand(2),
		});
		factory.pushMark(revive1);
		factory.pushMark(revive2);
		assert.deepStrictEqual(factory.list, [revive1, revive2]);
	});
});

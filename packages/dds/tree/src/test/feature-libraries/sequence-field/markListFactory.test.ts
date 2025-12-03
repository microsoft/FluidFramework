/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ChangesetLocalId, RevisionTag } from "../../../core/index.js";
import { SequenceField as SF } from "../../../feature-libraries/index.js";
import { brand } from "../../../util/index.js";
import { mintRevisionTag } from "../../utils.js";

import { MarkMaker as Mark } from "./testEdits.js";

const dummyMark = Mark.remove(1, brand(0));
const detachedBy: RevisionTag = mintRevisionTag();

export function testMarkListFactory() {
	describe("MarkListFactory", () => {
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

		it("Merges runs of no-op marks over populated cells", () => {
			const factory = new SF.MarkListFactory();
			factory.pushOffset(42);
			factory.pushOffset(42);
			factory.pushContent(dummyMark);
			assert.deepStrictEqual(factory.list, [{ count: 84 }, dummyMark]);
		});

		it("Keeps tombstones", () => {
			const factory = new SF.MarkListFactory();
			factory.push({ cellId: { localId: brand(0) }, count: 42 });
			factory.pushContent(dummyMark);
			const expected = [{ cellId: { localId: 0 }, count: 42 }, dummyMark];
			assert.deepStrictEqual(factory.list, expected);
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
			const insert1 = Mark.insert(1, id1);
			const insert2 = Mark.insert(1, id2);
			factory.pushContent(insert1);
			factory.pushContent(insert2);
			assert.deepStrictEqual(factory.list, [Mark.insert(2, id1)]);
		});

		it("Can merge consecutive removes", () => {
			const factory = new SF.MarkListFactory();
			const remove1 = Mark.remove(1, brand(0), {
				idOverride: { revision: detachedBy, localId: brand(10) },
			});
			const remove2 = Mark.remove(1, brand(1), {
				idOverride: { revision: detachedBy, localId: brand(11) },
			});
			factory.pushContent(remove1);
			factory.pushContent(remove2);
			assert.deepStrictEqual(factory.list, [
				Mark.remove(2, brand(0), {
					idOverride: { revision: detachedBy, localId: brand(10) },
				}),
			]);
		});

		it("Does not merge consecutive removes with discontinuous detach overrides", () => {
			const factory = new SF.MarkListFactory();
			const remove1 = Mark.remove(1, brand(0), {
				idOverride: { revision: detachedBy, localId: brand(10) },
			});
			const remove2 = Mark.remove(1, brand(1), {
				idOverride: { revision: detachedBy, localId: brand(42) },
			});
			factory.pushContent(remove1);
			factory.pushContent(remove2);
			assert.deepStrictEqual(factory.list, [remove1, remove2]);
		});

		it("Can merge adjacent moves", () => {
			const factory = new SF.MarkListFactory();
			const moveOut1 = Mark.moveOut(1, brand(0));
			const moveOut2 = Mark.moveOut(1, brand(1));
			const moveIn1 = Mark.moveIn(1, brand(0), { cellId: { localId: brand(2) } });
			const moveIn2 = Mark.moveIn(1, brand(1), { cellId: { localId: brand(3) } });
			factory.pushContent(moveOut1);
			factory.pushContent(moveOut2);
			factory.pushOffset(3);
			factory.pushContent(moveIn1);
			factory.pushContent(moveIn2);

			assert.deepStrictEqual(factory.list, [
				Mark.moveOut(2, brand(0)),
				{ count: 3 },
				Mark.moveIn(2, brand(0)),
			]);
		});

		it("Can merge three adjacent moves", () => {
			const factory = new SF.MarkListFactory();
			const moveOut1 = Mark.moveOut(1, brand(0));
			const moveOut2 = Mark.moveOut(1, brand(1));
			const moveOut3 = Mark.moveOut(1, brand(2));
			const moveIn1 = Mark.moveIn(1, brand(0), { cellId: { localId: brand(3) } });
			const moveIn2 = Mark.moveIn(1, brand(1), { cellId: { localId: brand(4) } });
			const moveIn3 = Mark.moveIn(1, brand(2), { cellId: { localId: brand(5) } });
			factory.pushContent(moveOut1);
			factory.pushContent(moveOut2);
			factory.pushContent(moveOut3);
			factory.pushOffset(3);
			factory.pushContent(moveIn1);
			factory.pushContent(moveIn2);
			factory.pushContent(moveIn3);

			assert.deepStrictEqual(factory.list, [
				Mark.moveOut(3, brand(0)),
				{ count: 3 },
				Mark.moveIn(3, brand(0)),
			]);
		});

		it("Can merge consecutive revives", () => {
			const factory = new SF.MarkListFactory();
			const revive1 = Mark.revive(1, {
				revision: detachedBy,
				localId: brand(0),
			});
			const revive2 = Mark.revive(1, {
				revision: detachedBy,
				localId: brand(1),
			});
			factory.pushContent(revive1);
			factory.pushContent(revive2);
			const expected = Mark.revive(2, {
				revision: detachedBy,
				localId: brand(0),
			});
			assert.deepStrictEqual(factory.list, [expected]);
		});

		it("Can merge consecutive return-tos", () => {
			const factory = new SF.MarkListFactory();
			const return1 = Mark.returnTo(1, brand(0), {
				revision: detachedBy,
				localId: brand(1),
			});
			const return2 = Mark.returnTo(2, brand(1), {
				revision: detachedBy,
				localId: brand(2),
			});
			factory.pushContent(return1);
			factory.pushContent(return2);
			const expected = Mark.returnTo(3, brand(0), {
				revision: detachedBy,
				localId: brand(1),
			});
			assert.deepStrictEqual(factory.list, [expected]);
		});

		it("Can merge consecutive move-out", () => {
			const factory = new SF.MarkListFactory();
			const return1 = Mark.moveOut(1, brand(0), {
				idOverride: { revision: detachedBy, localId: brand(10) },
			});
			const return2 = Mark.moveOut(2, brand(1), {
				idOverride: { revision: detachedBy, localId: brand(11) },
			});
			factory.pushContent(return1);
			factory.pushContent(return2);
			const expected = Mark.moveOut(3, brand(0), {
				idOverride: { revision: detachedBy, localId: brand(10) },
			});
			assert.deepStrictEqual(factory.list, [expected]);
		});

		it("Does not merge consecutive move-out with discontinuous detach overrides", () => {
			const factory = new SF.MarkListFactory();
			const return1 = Mark.moveOut(1, brand(0), {
				idOverride: { revision: detachedBy, localId: brand(10) },
			});
			const return2 = Mark.moveOut(2, brand(1), {
				idOverride: { revision: detachedBy, localId: brand(42) },
			});
			factory.pushContent(return1);
			factory.pushContent(return2);
			assert.deepStrictEqual(factory.list, [return1, return2]);
		});

		it("Does not merge revives with gaps", () => {
			const factory = new SF.MarkListFactory();
			const revive1 = Mark.revive(1, {
				revision: detachedBy,
				localId: brand(0),
			});
			const revive2 = Mark.revive(1, {
				revision: detachedBy,
				localId: brand(2),
			});
			factory.pushContent(revive1);
			factory.pushContent(revive2);
			assert.deepStrictEqual(factory.list, [revive1, revive2]);
		});
	});
}

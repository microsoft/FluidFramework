/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	AnchorSet,
	Delta,
	FieldKey,
	FieldKindIdentifier,
	isSkipMark,
	makeAnonChange,
	mintRevisionTag,
	RevisionTag,
	tagChange,
	tagRollbackInverse,
} from "../../core";
import { typeboxValidator } from "../../external-utilities";
import { DefaultEditBuilder, FieldKind } from "../../feature-libraries";

// eslint-disable-next-line import/no-internal-modules
import { sequence } from "../../feature-libraries/defaultFieldKinds";
import { brand, Mutable } from "../../util";
import { testChangeReceiver } from "../utils";
// eslint-disable-next-line import/no-internal-modules
import { ModularChangeFamily } from "../../feature-libraries/modular-schema/modularChangeFamily";

const fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind> = new Map(
	[sequence].map((f) => [f.identifier, f]),
);

const family = new ModularChangeFamily(fieldKinds, { jsonValidator: typeboxValidator });

const fieldA: FieldKey = brand("FieldA");
const fieldB: FieldKey = brand("FieldB");
const fieldC: FieldKey = brand("FieldC");

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();

// Tests the integration of ModularChangeFamily with the default field kinds.
describe("ModularChangeFamily integration", () => {
	describe("rebase", () => {
		it("delete over cross-field move", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, changeReceiver, new AnchorSet());
			editor.move(
				{ parent: undefined, field: fieldA },
				1,
				2,
				{ parent: undefined, field: fieldB },
				2,
			);
			editor.sequenceField({ parent: undefined, field: fieldA }).delete(1, 1);
			editor.sequenceField({ parent: undefined, field: fieldB }).delete(2, 1);
			const [move, remove, expected] = getChanges();
			const rebased = family.rebase(remove, tagChange(move, mintRevisionTag()));
			const rebasedDelta = normalizeDelta(family.intoDelta(rebased));
			const expectedDelta = normalizeDelta(family.intoDelta(expected));
			assert.deepEqual(rebasedDelta, expectedDelta);
		});

		it("cross-field move over delete", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, changeReceiver, new AnchorSet());
			editor.sequenceField({ parent: undefined, field: fieldA }).delete(1, 1);
			editor.move(
				{ parent: undefined, field: fieldA },
				1,
				2,
				{ parent: undefined, field: fieldB },
				2,
			);
			editor.move(
				{ parent: undefined, field: fieldA },
				1,
				1,
				{ parent: undefined, field: fieldB },
				2,
			);
			const [remove, move, expected] = getChanges();
			const rebased = family.rebase(move, tagChange(remove, mintRevisionTag()));
			const rebasedDelta = normalizeDelta(family.intoDelta(rebased));
			const expectedDelta = normalizeDelta(family.intoDelta(expected));
			assert.deepEqual(rebasedDelta, expectedDelta);
		});
	});

	describe("compose", () => {
		it("cross-field move and nested changes", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, changeReceiver, new AnchorSet());
			editor.move(
				{ parent: undefined, field: fieldA },
				0,
				1,
				{ parent: undefined, field: fieldB },
				0,
			);

			const newValue = "new value";
			editor.setValue({ parent: undefined, parentField: fieldB, parentIndex: 0 }, newValue);

			const [move, setValue] = getChanges();
			const composed = family.compose([makeAnonChange(move), makeAnonChange(setValue)]);
			const expected: Delta.Root = new Map([
				[
					fieldA,
					[
						{
							type: Delta.MarkType.MoveOut,
							count: 1,
							moveId: brand(0),
							setValue: newValue,
						},
					],
				],
				[fieldB, [{ type: Delta.MarkType.MoveIn, count: 1, moveId: brand(0) }]],
			]);

			const delta = family.intoDelta(composed);
			assert.deepEqual(delta, expected);
		});

		it("cross-field move and inverse with nested changes", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, changeReceiver, new AnchorSet());
			const value = 42;
			editor.move(
				{ parent: undefined, field: fieldA },
				0,
				1,
				{ parent: undefined, field: fieldB },
				0,
			);
			editor.setValue({ parent: undefined, parentField: fieldA, parentIndex: 0 }, value);

			const [move, setValue] = getChanges();
			const moveTagged = tagChange(move, tag1);
			const returnTagged = tagRollbackInverse(
				family.invert(moveTagged, true),
				tag3,
				moveTagged.revision,
			);

			const moveAndSetValue = family.compose([tagChange(setValue, tag2), moveTagged]);
			const composed = family.compose([returnTagged, makeAnonChange(moveAndSetValue)]);
			const actual = family.intoDelta(composed);
			const expected: Delta.Root = new Map([
				[fieldA, []],
				[fieldB, [{ type: Delta.MarkType.Modify, setValue: value }]],
			]);
			assert.deepEqual(actual, expected);
		});

		it("two cross-field moves of same node", () => {
			const [changeReceiver, getChanges] = testChangeReceiver(family);
			const editor = new DefaultEditBuilder(family, changeReceiver, new AnchorSet());
			editor.move(
				{ parent: undefined, field: fieldA },
				0,
				1,
				{ parent: undefined, field: fieldB },
				0,
			);
			editor.move(
				{ parent: undefined, field: fieldB },
				0,
				1,
				{ parent: undefined, field: fieldC },
				0,
			);
			editor.move(
				{ parent: undefined, field: fieldA },
				0,
				1,
				{ parent: undefined, field: fieldC },
				0,
			);
			const [move1, move2, expected] = getChanges();
			const composed = family.compose([makeAnonChange(move1), makeAnonChange(move2)]);
			const actualDelta = normalizeDelta(family.intoDelta(composed));
			const expectedDelta = normalizeDelta(family.intoDelta(expected));
			assert.deepEqual(actualDelta, expectedDelta);
		});
	});
});

function normalizeDelta(
	delta: Delta.Root,
	idAllocator?: () => Delta.MoveId,
	idMap?: Map<Delta.MoveId, Delta.MoveId>,
): Delta.Root {
	const genId = idAllocator ?? newIdAllocator();
	const map = idMap ?? new Map();

	const normalized = new Map();
	for (const [field, marks] of delta) {
		if (marks.length > 0) {
			normalized.set(field, normalizeDeltaField(marks, genId, map));
		}
	}

	return normalized;
}

function normalizeDeltaField(
	delta: Delta.MarkList,
	genId: () => Delta.MoveId,
	idMap: Map<Delta.MoveId, Delta.MoveId>,
): Delta.MarkList {
	const normalized = [];
	for (const origMark of delta) {
		if (isSkipMark(origMark)) {
			normalized.push(origMark);
			continue;
		}

		const mark: Mutable<Delta.Mark> = { ...origMark };
		switch (mark.type) {
			case Delta.MarkType.MoveIn:
			case Delta.MarkType.MoveOut: {
				let newId = idMap.get(mark.moveId);
				if (newId === undefined) {
					newId = genId();
					idMap.set(mark.moveId, newId);
				}

				mark.moveId = newId;
				break;
			}
			default:
				break;
		}

		switch (mark.type) {
			case Delta.MarkType.Modify:
			case Delta.MarkType.Delete:
			case Delta.MarkType.Insert:
			case Delta.MarkType.MoveOut: {
				if (mark.fields !== undefined) {
					mark.fields = normalizeDelta(mark.fields, genId, idMap);
				}
				break;
			}
			default:
				break;
		}

		normalized.push(mark);
	}

	return normalized;
}

function newIdAllocator(): () => Delta.MoveId {
	let maxId = 0;
	return () => brand(maxId++);
}

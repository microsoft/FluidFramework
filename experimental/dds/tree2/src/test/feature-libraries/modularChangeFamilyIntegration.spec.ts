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
	tagChange,
} from "../../core";
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

const family = new ModularChangeFamily(fieldKinds);

const fieldA: FieldKey = brand("FieldA");
const fieldB: FieldKey = brand("FieldB");
const fieldC: FieldKey = brand("FieldC");

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

	it("cross-field move composition", () => {
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

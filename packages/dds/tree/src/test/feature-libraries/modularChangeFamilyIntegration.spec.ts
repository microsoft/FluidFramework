/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { AnchorSet, FieldKey, FieldKindIdentifier, makeAnonChange } from "../../core";
import { DefaultEditBuilder, FieldKind, ModularChangeFamily } from "../../feature-libraries";

// eslint-disable-next-line import/no-internal-modules
import { sequence } from "../../feature-libraries/defaultFieldKinds";
import { brand } from "../../util";

const fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind> = new Map(
	[sequence].map((f) => [f.identifier, f]),
);

const family = new ModularChangeFamily(fieldKinds);

const fieldA: FieldKey = brand("FieldA");
const fieldB: FieldKey = brand("FieldB");

describe("rebase", () => {
	it("delete over cross-field move", () => {
		const editor = new DefaultEditBuilder(family, () => {}, new AnchorSet());
		editor.move(undefined, fieldA, 1, 2, undefined, fieldB, 2);
		editor.sequenceField(undefined, fieldA).delete(1, 1);
		editor.sequenceField(undefined, fieldB).delete(2, 1);
		const [move, remove, expected] = editor.getChanges();
		const rebased = family.rebase(remove, makeAnonChange(move));
		assert.deepEqual(family.intoDelta(rebased), family.intoDelta(expected));
	});

	it("cross-field move over delete", () => {
		const editor = new DefaultEditBuilder(family, () => {}, new AnchorSet());
		editor.sequenceField(undefined, fieldA).delete(1, 1);
		editor.move(undefined, fieldA, 1, 2, undefined, fieldB, 2);
		editor.move(undefined, fieldA, 1, 1, undefined, fieldB, 2);
		const [remove, move, expected] = editor.getChanges();
		const rebased = family.rebase(move, makeAnonChange(remove));
		assert.deepEqual(family.intoDelta(rebased), family.intoDelta(expected));
	});
});

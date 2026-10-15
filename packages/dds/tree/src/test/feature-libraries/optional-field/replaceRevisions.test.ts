/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChangeAtomId, RevisionTag } from "../../../core/index.js";
import {
	DefaultRevisionReplacer,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/modular-schema/index.js";
import {
	optionalChangeRebaser,
	optionalFieldEditor as editor,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/optional-field/optionalField.js";
import type {
	OptionalChangeset,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/optional-field/optionalFieldChangeTypes.js";
import { type Mutable, brand } from "../../../util/index.js";
import { mintRevisionTag } from "../../utils.js";

import { assertEqual } from "./optionalFieldUtils.js";

const tag0: RevisionTag = mintRevisionTag();
const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tagOut: RevisionTag = mintRevisionTag();

const atom0: ChangeAtomId = { revision: tag0, localId: brand(0) };
const atom1: ChangeAtomId = { revision: tag1, localId: brand(1) };
const atom2: ChangeAtomId = { revision: tag2, localId: brand(10) };
const atom3: ChangeAtomId = { localId: brand(100) };

const inputRevs = new Set([tag1, tag2, undefined]);

export function testReplaceRevisions(): void {
	describe(`replaceRevisions {${[...inputRevs.keys()].join(",")}} -> ${tagOut}`, () => {
		runCases(tagOut);
	});
}

function runCases(outputRev: RevisionTag) {
	const atomOut1: Mutable<ChangeAtomId> = { localId: brand(1) };
	const atomOut2: Mutable<ChangeAtomId> = { localId: brand(10) };
	const atomOut3: Mutable<ChangeAtomId> = { localId: brand(100) };
	if (outputRev !== undefined) {
		atomOut1.revision = outputRev;
		atomOut2.revision = outputRev;
		atomOut3.revision = outputRev;
	}

	function process(changeset: OptionalChangeset): OptionalChangeset {
		const replacer = new DefaultRevisionReplacer(outputRev, inputRevs);
		return optionalChangeRebaser.replaceRevisions(changeset, replacer);
	}

	it("child change", () => {
		assertEqual(process(editor.childChange(atom0)), editor.childChange(atom0));
		assertEqual(process(editor.childChange(atom1)), editor.childChange(atomOut1));
		assertEqual(process(editor.childChange(atom2)), editor.childChange(atomOut2));
		assertEqual(process(editor.childChange(atom3)), editor.childChange(atomOut3));
	});

	it("replace", () => {
		assertEqual(
			process(editor.set(false, { detach: atom0, fill: atom1 })),
			editor.set(false, { detach: atom0, fill: atomOut1 }),
		);
		assertEqual(
			process(editor.set(false, { detach: atom1, fill: atom2 })),
			editor.set(false, { detach: atomOut1, fill: atomOut2 }),
		);
		assertEqual(
			process(editor.set(true, { detach: atom2, fill: atom3 })),
			editor.set(true, { detach: atomOut2, fill: atomOut3 }),
		);
		assertEqual(
			process(editor.set(true, { detach: atom3, fill: atom0 })),
			editor.set(true, { detach: atomOut3, fill: atom0 }),
		);
	});

	it("detach", () => {
		assertEqual(process(editor.detach(atom0)), editor.detach(atom0));
		assertEqual(process(editor.detach(atom1)), editor.detach(atomOut1));
		assertEqual(process(editor.detach(atom2)), editor.detach(atomOut2));
		assertEqual(process(editor.detach(atom3)), editor.detach(atomOut3));
	});
}

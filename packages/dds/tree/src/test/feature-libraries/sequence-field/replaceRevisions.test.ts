/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { deepFreeze } from "@fluidframework/test-runtime-utils/internal";

import type { ChangeAtomId, RevisionTag } from "../../../core/index.js";
import {
	DefaultRevisionReplacer,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/modular-schema/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { sequenceFieldChangeRebaser } from "../../../feature-libraries/sequence-field/sequenceFieldChangeRebaser.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { Changeset } from "../../../feature-libraries/sequence-field/types.js";
import { type Mutable, brand } from "../../../util/index.js";
import { mintRevisionTag } from "../../utils.js";

import { MarkMaker as Mark } from "./testEdits.js";
import { assertChangesetsEqual } from "./utils.js";

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

	function process(changeset: Changeset): Changeset {
		deepFreeze(changeset);
		const replacer = new DefaultRevisionReplacer(outputRev, inputRevs);
		return sequenceFieldChangeRebaser.replaceRevisions(changeset, replacer);
	}

	it("tombstones", () => {
		const input: Changeset = [
			Mark.tomb(tag0, brand(0)),
			Mark.tomb(tag1, brand(0)),
			Mark.tomb(tag2, brand(1)),
			Mark.tomb(undefined, brand(2)),
		];
		const expected: Changeset = [Mark.tomb(tag0, brand(0)), Mark.tomb(outputRev, brand(0), 3)];
		const actual = process(input);
		assertChangesetsEqual(actual, expected);
	});

	it("renames", () => {
		const input: Changeset = [
			Mark.rename(1, atom0, atom0),
			Mark.rename(1, atom1, atom1),
			Mark.rename(1, atom2, atom2),
			Mark.rename(1, atom3, atom3),
		];
		const expected: Changeset = [
			Mark.rename(1, atom0, atom0),
			Mark.rename(1, atomOut1, atomOut1),
			Mark.rename(1, atomOut2, atomOut2),
			Mark.rename(1, atomOut3, atomOut3),
		];
		const actual = process(input);
		assertChangesetsEqual(actual, expected);
	});

	it("child changes", () => {
		const input: Changeset = [
			Mark.modify(atom0, atom0),
			Mark.modify(atom1, atom1),
			Mark.modify(atom2, atom2),
			Mark.modify(atom3, atom3),
		];
		const expected: Changeset = [
			Mark.modify(atom0, atom0),
			Mark.modify(atomOut1, atomOut1),
			Mark.modify(atomOut2, atomOut2),
			Mark.modify(atomOut3, atomOut3),
		];
		const actual = process(input);
		assertChangesetsEqual(actual, expected);
	});

	it("insert and remove marks", () => {
		const input: Changeset = [
			Mark.attach(1, atom0),
			Mark.attach(1, atom1),
			Mark.attach(1, atom2),
			Mark.attach(1, atom3),
			Mark.detach(1, atom0, { cellRename: atom1 }),
			Mark.detach(1, atom1, { cellRename: atom2 }),
			Mark.detach(1, atom2, { cellRename: atom3 }),
			Mark.detach(1, atom3, { cellRename: atom0 }),
		];
		const expected: Changeset = [
			Mark.attach(1, atom0),
			Mark.attach(1, atomOut1),
			Mark.attach(1, atomOut2),
			Mark.attach(1, atomOut3),
			Mark.detach(1, atom0, { cellRename: atomOut1 }),
			Mark.detach(1, atomOut1, { cellRename: atomOut2 }),
			Mark.detach(1, atomOut2, { cellRename: atomOut3 }),
			Mark.detach(1, atomOut3, { cellRename: atom0 }),
		];
		const actual = process(input);
		assertChangesetsEqual(actual, expected);
	});
}

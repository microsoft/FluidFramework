/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { deepFreeze } from "@fluidframework/test-runtime-utils/internal";

import { ChangeAtomId, RevisionTag } from "../../../core/index.js";
import { SequenceField as SF } from "../../../feature-libraries/index.js";
import { mintRevisionTag } from "../../utils.js";
import { Mutable, brand } from "../../../util/index.js";
import { assertChangesetsEqual } from "./utils.js";
import { MarkMaker as Mark } from "./testEdits.js";

const tag0: RevisionTag = mintRevisionTag();
const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tagOut: RevisionTag = mintRevisionTag();

const atom0: ChangeAtomId = { revision: tag0, localId: brand(0) };
const atom1: ChangeAtomId = { revision: tag1, localId: brand(1) };
const atom2: ChangeAtomId = { revision: tag2, localId: brand(10) };
const atom3: ChangeAtomId = { localId: brand(100) };

const inputRevs = new Set([tag1, tag2, undefined]);

export function testReplaceRevisions() {
	describe("replaceRevisions", () => {
		for (const outputRev of [tagOut, undefined]) {
			describe(`{${Array.from(inputRevs.keys()).join(",")}} -> ${outputRev}`, () => {
				runCases(outputRev);
			});
		}
	});
}

function runCases(outputRev: RevisionTag | undefined) {
	const atomOut1: Mutable<ChangeAtomId> = { localId: brand(1) };
	const atomOut2: Mutable<ChangeAtomId> = { localId: brand(10) };
	const atomOut3: Mutable<ChangeAtomId> = { localId: brand(100) };
	if (outputRev !== undefined) {
		atomOut1.revision = outputRev;
		atomOut2.revision = outputRev;
		atomOut3.revision = outputRev;
	}

	function process(changeset: SF.Changeset): SF.Changeset {
		deepFreeze(changeset);
		return SF.sequenceFieldChangeRebaser.replaceRevisions(changeset, inputRevs, outputRev);
	}

	it("tombstones", () => {
		const input: SF.Changeset = [
			Mark.tomb(tag0, brand(0)),
			Mark.tomb(tag1, brand(0)),
			Mark.tomb(tag2, brand(1)),
			Mark.tomb(undefined, brand(2)),
		];
		const expected: SF.Changeset = [
			Mark.tomb(tag0, brand(0)),
			Mark.tomb(outputRev, brand(0), 3),
		];
		const actual = process(input);
		assertChangesetsEqual(actual, expected);
	});

	it("child changes", () => {
		const input: SF.Changeset = [
			Mark.modify(atom0, atom0),
			Mark.modify(atom1, atom1),
			Mark.modify(atom2, atom2),
			Mark.modify(atom3, atom3),
		];
		const expected: SF.Changeset = [
			Mark.modify(atom0, atom0),
			Mark.modify(atomOut1, atomOut1),
			Mark.modify(atomOut2, atomOut2),
			Mark.modify(atomOut3, atomOut3),
		];
		const actual = process(input);
		assertChangesetsEqual(actual, expected);
	});

	it("insert and remove marks", () => {
		const input: SF.Changeset = [
			Mark.insert(1, atom0),
			Mark.insert(1, atom1),
			Mark.insert(1, atom2),
			Mark.insert(1, atom3),
			Mark.remove(1, atom0),
			Mark.remove(1, atom1),
			Mark.remove(1, atom2),
			Mark.remove(1, atom3),
		];
		const expected: SF.Changeset = [
			Mark.insert(1, atom0),
			Mark.insert(1, atomOut1),
			Mark.insert(1, atomOut2),
			Mark.insert(1, atomOut3),
			Mark.remove(1, atom0),
			Mark.remove(1, atomOut1),
			Mark.remove(1, atomOut2),
			Mark.remove(1, atomOut3),
		];
		const actual = process(input);
		assertChangesetsEqual(actual, expected);
	});

	it("move marks", () => {
		const input: SF.Changeset = [
			Mark.moveOut(1, atom0, { finalEndpoint: atom0 }),
			Mark.moveOut(1, atom1, { finalEndpoint: atom1 }),
			Mark.moveOut(1, atom2, { finalEndpoint: atom2 }),
			Mark.moveOut(1, atom3, { finalEndpoint: atom3 }),
			Mark.moveIn(1, atom0, { finalEndpoint: atom0 }),
			Mark.moveIn(1, atom1, { finalEndpoint: atom1 }),
			Mark.moveIn(1, atom2, { finalEndpoint: atom2 }),
			Mark.moveIn(1, atom3, { finalEndpoint: atom3 }),
		];
		const expected: SF.Changeset = [
			Mark.moveOut(1, atom0, { finalEndpoint: atom0 }),
			Mark.moveOut(1, atomOut1, { finalEndpoint: atomOut1 }),
			Mark.moveOut(1, atomOut2, { finalEndpoint: atomOut2 }),
			Mark.moveOut(1, atomOut3, { finalEndpoint: atomOut3 }),
			Mark.moveIn(1, atom0, { finalEndpoint: atom0 }),
			Mark.moveIn(1, atomOut1, { finalEndpoint: atomOut1 }),
			Mark.moveIn(1, atomOut2, { finalEndpoint: atomOut2 }),
			Mark.moveIn(1, atomOut3, { finalEndpoint: atomOut3 }),
		];
		const actual = process(input);
		assertChangesetsEqual(actual, expected);
	});

	it("attach an detach marks", () => {
		const input: SF.Changeset = [
			Mark.attachAndDetach(Mark.moveIn(1, atom0), Mark.moveOut(1, atom0)),
			Mark.attachAndDetach(Mark.moveIn(1, atom1), Mark.moveOut(1, atom2)),
			Mark.attachAndDetach(Mark.moveIn(1, atom2), Mark.moveOut(1, atom3)),
			Mark.attachAndDetach(Mark.moveIn(1, atom3), Mark.moveOut(1, atom1)),
		];
		const expected: SF.Changeset = [
			Mark.attachAndDetach(Mark.moveIn(1, atom0), Mark.moveOut(1, atom0)),
			Mark.attachAndDetach(Mark.moveIn(1, atomOut1), Mark.moveOut(1, atomOut2)),
			Mark.attachAndDetach(Mark.moveIn(1, atomOut2), Mark.moveOut(1, atomOut3)),
			Mark.attachAndDetach(Mark.moveIn(1, atomOut3), Mark.moveOut(1, atomOut1)),
		];
		const actual = process(input);
		assertChangesetsEqual(actual, expected);
	});
}

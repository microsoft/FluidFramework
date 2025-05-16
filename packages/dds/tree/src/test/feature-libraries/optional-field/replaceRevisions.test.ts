// XXX
// /*!
//  * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
//  * Licensed under the MIT License.
//  */

// import type { ChangeAtomId, RevisionTag } from "../../../core/index.js";
// import { mintRevisionTag } from "../../utils.js";
// import { type Mutable, brand } from "../../../util/index.js";
// import {
// 	type OptionalChangeset,
// 	optionalChangeRebaser,
// 	// eslint-disable-next-line import/no-internal-modules
// } from "../../../feature-libraries/optional-field/index.js";
// import { Change, assertEqual } from "./optionalFieldUtils.js";

// const tag0: RevisionTag = mintRevisionTag();
// const tag1: RevisionTag = mintRevisionTag();
// const tag2: RevisionTag = mintRevisionTag();
// const tagOut: RevisionTag = mintRevisionTag();

// const atom0: ChangeAtomId = { revision: tag0, localId: brand(0) };
// const atom1: ChangeAtomId = { revision: tag1, localId: brand(1) };
// const atom2: ChangeAtomId = { revision: tag2, localId: brand(10) };
// const atom3: ChangeAtomId = { localId: brand(100) };

// const inputRevs = new Set([tag1, tag2, undefined]);

// export function testReplaceRevisions() {
// 	describe("replaceRevisions", () => {
// 		for (const outputRev of [tagOut, undefined]) {
// 			describe(`{${Array.from(inputRevs.keys()).join(",")}} -> ${outputRev}`, () => {
// 				runCases(outputRev);
// 			});
// 		}
// 	});
// }

// function runCases(outputRev: RevisionTag | undefined) {
// 	const atomOut1: Mutable<ChangeAtomId> = { localId: brand(1) };
// 	const atomOut2: Mutable<ChangeAtomId> = { localId: brand(10) };
// 	const atomOut3: Mutable<ChangeAtomId> = { localId: brand(100) };
// 	if (outputRev !== undefined) {
// 		atomOut1.revision = outputRev;
// 		atomOut2.revision = outputRev;
// 		atomOut3.revision = outputRev;
// 	}

// 	function process(changeset: OptionalChangeset): OptionalChangeset {
// 		return optionalChangeRebaser.replaceRevisions(changeset, inputRevs, outputRev);
// 	}

// 	it("moves", () => {
// 		const input = Change.atOnce(
// 			Change.move(atom0, atom1),
// 			Change.move(atom1, atom2),
// 			Change.move(atom2, atom3),
// 			Change.move(atom3, atom0),
// 		);
// 		const expected = Change.atOnce(
// 			Change.move(atom0, atomOut1),
// 			Change.move(atomOut1, atomOut2),
// 			Change.move(atomOut2, atomOut3),
// 			Change.move(atomOut3, atom0),
// 		);
// 		const actual = process(input);
// 		assertEqual(actual, expected);
// 	});

// 	it("child changes", () => {
// 		assertEqual(process(Change.child(atom0)), Change.child(atom0));
// 		assertEqual(process(Change.child(atom1)), Change.child(atomOut1));
// 		assertEqual(process(Change.child(atom2)), Change.child(atomOut2));
// 		assertEqual(process(Change.child(atom3)), Change.child(atomOut3));
// 		assertEqual(process(Change.childAt(atom0, atom0)), Change.childAt(atom0, atom0));
// 		assertEqual(process(Change.childAt(atom1, atom1)), Change.childAt(atomOut1, atomOut1));
// 		assertEqual(process(Change.childAt(atom2, atom2)), Change.childAt(atomOut2, atomOut2));
// 		assertEqual(process(Change.childAt(atom3, atom3)), Change.childAt(atomOut3, atomOut3));
// 	});

// 	it("replace", () => {
// 		assertEqual(
// 			process(Change.atOnce(Change.clear("self", atom0), Change.move(atom1, "self"))),
// 			Change.atOnce(Change.clear("self", atom0), Change.move(atomOut1, "self")),
// 		);
// 		assertEqual(
// 			process(Change.atOnce(Change.clear("self", atom1), Change.move(atom2, "self"))),
// 			Change.atOnce(Change.clear("self", atomOut1), Change.move(atomOut2, "self")),
// 		);
// 		assertEqual(
// 			process(Change.atOnce(Change.clear("self", atom2), Change.move(atom3, "self"))),
// 			Change.atOnce(Change.clear("self", atomOut3), Change.move(atomOut3, "self")),
// 		);
// 		assertEqual(
// 			process(Change.atOnce(Change.clear("self", atom3), Change.move(atom0, "self"))),
// 			Change.atOnce(Change.clear("self", atomOut3), Change.move(atom0, "self")),
// 		);
// 	});
// }

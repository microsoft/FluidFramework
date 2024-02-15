/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TaggedChange } from "../../../core/index.js";
import {
	RegisterId,
	OptionalChangeset,
	RegisterMap,
	withRevision,
	Move,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/optional-field/index.js";

// Optional changesets may be equivalent but not evaluate to be deep-equal, as some ordering is irrelevant.
export function assertEqual(
	a: TaggedChange<OptionalChangeset> | undefined,
	b: TaggedChange<OptionalChangeset> | undefined,
): void {
	if (a === undefined || b === undefined) {
		assert.deepEqual(a, b);
		return;
	}
	const normalizeRegisterId = (registerId: RegisterId): string => {
		if (typeof registerId === "string") {
			return `s${registerId}`;
		}
		return `r${registerId.revision}id${registerId.localId}`;
	};
	const compareRegisterIds = (c: RegisterId, d: RegisterId) =>
		normalizeRegisterId(c).localeCompare(normalizeRegisterId(d));
	// The composed rebase implementation deep-freezes.
	const aCopy = { ...a, change: { ...a.change, moves: [...a.change.moves] } };
	const bCopy = { ...b, change: { ...b.change, moves: [...b.change.moves] } };
	aCopy.change.moves.sort(([c], [d]) => compareRegisterIds(c, d));
	bCopy.change.moves.sort(([c], [d]) => compareRegisterIds(c, d));

	assert.equal(
		aCopy.change.reservedDetachId !== undefined,
		bCopy.change.reservedDetachId !== undefined,
	);
	delete aCopy.change.reservedDetachId;
	delete bCopy.change.reservedDetachId;
	assert.deepEqual(aCopy, bCopy);
}

export function verifyContextChain(
	a: TaggedChange<OptionalChangeset>,
	b: TaggedChange<OptionalChangeset>,
): void {
	const emptiedByA = new RegisterMap<true>();
	const emptiedByB = new RegisterMap<true>();
	const filledByA = new RegisterMap<true>();
	for (const leg1 of a.change.moves) {
		if (!isNoopMove(leg1)) {
			emptiedByA.set(withRevision(leg1[0], a.revision), true);
			filledByA.set(withRevision(leg1[1], a.revision), true);
		}
	}
	for (const leg2 of b.change.moves) {
		if (!isNoopMove(leg2)) {
			emptiedByB.set(withRevision(leg2[0], b.revision), true);
		}
	}

	for (const leg2 of b.change.moves) {
		const src = withRevision(leg2[0], b.revision);
		const dst = withRevision(leg2[1], b.revision);
		const emptiesSource = emptiedByA.has(src) && !filledByA.has(src);
		assert.equal(
			emptiesSource,
			false,
			"The same register is emptied by leg1 but moved from by leg2",
		);
		if (!isNoopMove(leg2) && !emptiedByB.has(dst)) {
			const fillsDestination = filledByA.has(dst);
			assert.equal(
				fillsDestination,
				false,
				"The same register is filled by leg1 and filled by leg2",
			);
		}
	}
	if (b.change.reservedDetachId !== undefined) {
		const dst = withRevision(b.change.reservedDetachId, b.revision);
		const fillsSource = filledByA.has("self");
		assert.equal(
			fillsSource,
			false,
			"The self register is filled by leg1 but expected to be empty by leg2",
		);
		if (!emptiedByB.has(dst)) {
			const fillsDestination = filledByA.has(dst);
			assert.equal(
				fillsDestination,
				false,
				// While changeset b does not actually attempt to fill that register.
				// it would if rebased over a changeset that fills "self".
				"The same register is at risk of being filled by leg1 and filled by leg2",
			);
		}
	}
}

function isNoopMove(move: Move): boolean {
	return registerEqual(move[0], move[1]);
}

function registerEqual(a: RegisterId, b: RegisterId): boolean {
	if (typeof a === "string" || typeof b === "string") {
		return a === b;
	}
	return a.revision === b.revision && a.localId === b.localId;
}

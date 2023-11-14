/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TaggedChange } from "../../../core";
// eslint-disable-next-line import/no-internal-modules
import {
	ContentId,
	OptionalChangeset,
} from "../../../feature-libraries/default-field-kinds/defaultFieldChangeTypes";

// Optional changesets may be equivalent but not evaluate to be deep-equal, as the order of moves is irrelevant.
export function assertEqual(
	a: TaggedChange<OptionalChangeset> | undefined,
	b: TaggedChange<OptionalChangeset> | undefined,
): void {
	if (a === undefined || b === undefined) {
		assert.deepEqual(a, b);
		return;
	}
	const normalizeContentId = (contentId: ContentId): string => {
		if (typeof contentId === "string") {
			return `s${contentId}`;
		}
		return `r${contentId.revision}id${contentId.localId}`;
	};
	const compareContentIds = (a: ContentId, b: ContentId) =>
		normalizeContentId(a).localeCompare(normalizeContentId(b));
	// The composed rebase implementation deep-freezes.
	const aCopy = { ...a, change: { ...a.change, moves: [...a.change.moves] } };
	const bCopy = { ...b, change: { ...b.change, moves: [...b.change.moves] } };
	aCopy.change.moves.sort(([a], [b]) => compareContentIds(a, b));
	bCopy.change.moves.sort(([a], [b]) => compareContentIds(a, b));
	aCopy.change.build.sort((a, b) => compareContentIds(a.id, b.id));
	bCopy.change.build.sort((a, b) => compareContentIds(a.id, b.id));

	// TODO: This shouldn't be necessary. might be causing correctness issues.
	delete aCopy.change.reservedDetachId;
	delete bCopy.change.reservedDetachId;
	assert.deepEqual(aCopy, bCopy);
}

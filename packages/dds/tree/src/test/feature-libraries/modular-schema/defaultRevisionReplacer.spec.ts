/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ChangeAtomId, ChangesetLocalId, RevisionTag } from "../../../core/index.js";
import { makeChangeAtomId, offsetChangeAtomId } from "../../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { DefaultRevisionReplacer } from "../../../feature-libraries/modular-schema/defaultRevisionReplacer.js";
import { brandConst } from "../../../util/index.js";

describe("DefaultRevisionReplacer", () => {
	const obsoleteRev1: RevisionTag = "obsoleteRev1" as RevisionTag;
	const obsoleteRev2: RevisionTag = "obsoleteRev2" as RevisionTag;
	const obsoleteRev3: RevisionTag = "obsoleteRev3" as RevisionTag;
	const otherRev: RevisionTag = "otherRev" as RevisionTag;
	const updatedRev: RevisionTag = "updatedRev" as RevisionTag;
	const localId1 = brandConst(1)<ChangesetLocalId>();
	const localId2 = brandConst(2)<ChangesetLocalId>();

	describe("isObsolete", () => {
		it("returns true for revisions in the obsolete revision set", () => {
			const replacer = new DefaultRevisionReplacer(
				updatedRev,
				new Set([obsoleteRev1, obsoleteRev2, undefined]),
			);
			assert.equal(replacer.isObsolete(obsoleteRev1), true);
			assert.equal(replacer.isObsolete(obsoleteRev2), true);
			assert.equal(replacer.isObsolete(undefined), true);
		});

		it("returns false for revisions not in the obsolete revision set", () => {
			const replacer = new DefaultRevisionReplacer(
				updatedRev,
				new Set([obsoleteRev1, obsoleteRev2]),
			);
			assert.equal(replacer.isObsolete(otherRev), false);
			assert.equal(replacer.isObsolete(updatedRev), false);
			assert.equal(replacer.isObsolete(undefined), false);
		});
	});

	describe("getUpdatedAtomId", () => {
		it("returns the same ID if revision is not obsolete", () => {
			const replacer = new DefaultRevisionReplacer(updatedRev, new Set([obsoleteRev1]));
			const id = makeChangeAtomId(localId1, otherRev);
			const result = replacer.getUpdatedAtomId(id);
			assert.equal(result, id);
		});

		it("replaces obsolete revision with updated revision", () => {
			const replacer = new DefaultRevisionReplacer(updatedRev, new Set([obsoleteRev1]));
			const id = makeChangeAtomId(localId1, obsoleteRev1);
			const result = replacer.getUpdatedAtomId(id);
			assert.equal(result.revision, updatedRev);
			assert.equal(result.localId, id.localId);
		});

		it("reuses local IDs when no conflict exists", () => {
			const replacer = new DefaultRevisionReplacer(updatedRev, new Set([obsoleteRev1]));
			const id1 = makeChangeAtomId(localId1, obsoleteRev1);
			const id2 = makeChangeAtomId(localId2, obsoleteRev1);
			const result1 = replacer.getUpdatedAtomId(id1);
			const result2 = replacer.getUpdatedAtomId(id2);
			assert.equal(result1.revision, updatedRev);
			assert.equal(result2.revision, updatedRev);
			assert.equal(result1.localId, id1.localId);
			assert.equal(result2.localId, id2.localId);
		});

		it("generates new local IDs when there is a conflict", () => {
			const replacer = new DefaultRevisionReplacer(
				updatedRev,
				new Set([obsoleteRev1, obsoleteRev2, obsoleteRev3]),
			);
			const id1 = makeChangeAtomId(localId1, obsoleteRev1);
			const id2 = makeChangeAtomId(localId1, obsoleteRev2);
			const result1 = replacer.getUpdatedAtomId(id1);
			assert.equal(result1.localId, id1.localId);
			const result2 = replacer.getUpdatedAtomId(id2);
			assert.notDeepEqual(result2, result1);
			const id3 = makeChangeAtomId(result2.localId, obsoleteRev3);
			const result3 = replacer.getUpdatedAtomId(id3);
			assert.notDeepEqual(result3, result1);
			assert.notDeepEqual(result3, result2);
		});

		it("returns consistent updated ID for repeated calls with same obsolete ID", () => {
			const replacer = new DefaultRevisionReplacer(updatedRev, new Set([obsoleteRev1]));
			const result1 = replacer.getUpdatedAtomId(makeChangeAtomId(localId1, obsoleteRev1));
			const result2 = replacer.getUpdatedAtomId(makeChangeAtomId(localId1, obsoleteRev1));
			assert.deepEqual(result1, result2);
		});

		it("handles undefined obsolete revision", () => {
			const replacer = new DefaultRevisionReplacer(updatedRev, new Set([undefined]));
			const id = makeChangeAtomId(localId1, undefined);
			const result = replacer.getUpdatedAtomId(id);
			assert.equal(result.revision, updatedRev);
		});

		it("preserves properties of generic ChangeAtomId type", () => {
			interface ExtendedChangeAtomId extends ChangeAtomId {
				extra: string;
			}
			const replacer = new DefaultRevisionReplacer(updatedRev, new Set([obsoleteRev1]));
			const id: ExtendedChangeAtomId = {
				localId: localId1,
				revision: obsoleteRev1,
				extra: "test",
			};
			const result = replacer.getUpdatedAtomId(id);
			assert.notEqual(result, id);
			assert.equal(result.extra, "test");
			assert.equal(result.revision, updatedRev);
		});

		it("handles count > 1 when no IDs in the range were previously updated", () => {
			const replacer = new DefaultRevisionReplacer(updatedRev, new Set([obsoleteRev1]));
			const id = makeChangeAtomId(localId1, obsoleteRev1);
			const expected = makeChangeAtomId(localId1, updatedRev);
			const actual = replacer.getUpdatedAtomId(id, 3);
			assert.deepEqual(actual, expected);
		});

		it("handles count > 1 when all IDs in the range were previously updated in a single block", () => {
			const replacer = new DefaultRevisionReplacer(updatedRev, new Set([obsoleteRev1]));
			const id = makeChangeAtomId(localId1, obsoleteRev1);
			const expected = makeChangeAtomId(localId1, updatedRev);
			const actual123 = replacer.getUpdatedAtomId(id, 3);
			assert.deepEqual(actual123, expected);
			const actual12 = replacer.getUpdatedAtomId(id, 2);
			assert.deepEqual(actual12, expected);
			const actual23 = replacer.getUpdatedAtomId(offsetChangeAtomId(id, 1), 2);
			assert.deepEqual(actual23, offsetChangeAtomId(expected, 1));
		});

		it("handles count > 1 when all IDs in the range were previously updated in separate blocks", () => {
			const replacer = new DefaultRevisionReplacer(updatedRev, new Set([obsoleteRev1]));
			const id = makeChangeAtomId(localId1, obsoleteRev1);
			replacer.getUpdatedAtomId(id, 2);
			replacer.getUpdatedAtomId(offsetChangeAtomId(id, 2), 1);

			const actual123 = replacer.getUpdatedAtomId(id, 3);
			assert.deepEqual(actual123, makeChangeAtomId(localId1, updatedRev));
		});

		it("handles count > 1 when some IDs in the range were previously updated with the same local IDs", () => {
			const obsoleteInRev1 = makeChangeAtomId(localId1, obsoleteRev1);
			const expected = makeChangeAtomId(localId1, updatedRev);
			for (let i = 0; i < 3; i++) {
				const replacer = new DefaultRevisionReplacer(updatedRev, new Set([obsoleteRev1]));
				replacer.getUpdatedAtomId(offsetChangeAtomId(obsoleteInRev1, i), 1);
				const actual123 = replacer.getUpdatedAtomId(obsoleteInRev1, 3);
				assert.deepEqual(actual123, expected);
			}
		});

		// TODO: Handle non-contiguous ranges
		it("throw an error when it encounters a case it does not support", () => {
			const obsoleteRevisions = new Set([obsoleteRev1, obsoleteRev2]);
			const obsoleteInRev1 = makeChangeAtomId(localId1, obsoleteRev1);
			const obsoleteInRev2 = makeChangeAtomId(localId2, obsoleteRev2);
			const replacer = new DefaultRevisionReplacer(updatedRev, obsoleteRevisions);
			replacer.getUpdatedAtomId(obsoleteInRev2, 100);
			replacer.getUpdatedAtomId(offsetChangeAtomId(obsoleteInRev1, 1), 1);
			assert.throws(() => replacer.getUpdatedAtomId(obsoleteInRev1, 2));
		});
	});
});

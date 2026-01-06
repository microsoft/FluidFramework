/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ChangeAtomId, ChangesetLocalId, RevisionTag } from "../../../core/index.js";
import { makeChangeAtomId } from "../../../core/index.js";
import { brandConst } from "../../../util/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { DefaultRevisionReplacer } from "../../../feature-libraries/modular-schema/defaultRevisionReplacer.js";

describe("DefaultRevisionReplacer", () => {
	const obsoleteRev1: RevisionTag = "obsoleteRev1" as RevisionTag;
	const obsoleteRev2: RevisionTag = "obsoleteRev2" as RevisionTag;
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
				new Set([obsoleteRev1, obsoleteRev2]),
			);
			const id1 = makeChangeAtomId(localId1, obsoleteRev1);
			const id2 = makeChangeAtomId(localId1, obsoleteRev2);
			const result1 = replacer.getUpdatedAtomId(id1);
			const result2 = replacer.getUpdatedAtomId(id2);
			assert.equal(result1.localId, id1.localId);
			assert.notDeepEqual(result2, result1);
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
	});
});

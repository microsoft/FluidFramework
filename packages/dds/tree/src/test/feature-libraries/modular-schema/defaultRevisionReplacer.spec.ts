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
	const oldRev1: RevisionTag = "oldRev1" as RevisionTag;
	const oldRev2: RevisionTag = "oldRev2" as RevisionTag;
	const otherRev: RevisionTag = "otherRev" as RevisionTag;
	const newRev: RevisionTag = "newRev" as RevisionTag;
	const localId1 = brandConst(1)<ChangesetLocalId>();
	const localId2 = brandConst(2)<ChangesetLocalId>();

	describe("isOldRevision", () => {
		it("returns true for revisions in the old revision set", () => {
			const replacer = new DefaultRevisionReplacer(
				newRev,
				new Set([oldRev1, oldRev2, undefined]),
			);
			assert.equal(replacer.isOldRevision(oldRev1), true);
			assert.equal(replacer.isOldRevision(oldRev2), true);
			assert.equal(replacer.isOldRevision(undefined), true);
		});

		it("returns false for revisions not in the old revision set", () => {
			const replacer = new DefaultRevisionReplacer(newRev, new Set([oldRev1, oldRev2]));
			assert.equal(replacer.isOldRevision(otherRev), false);
			assert.equal(replacer.isOldRevision(newRev), false);
			assert.equal(replacer.isOldRevision(undefined), false);
		});
	});

	describe("getUpdatedAtomId", () => {
		it("returns the same ID if revision is not old", () => {
			const replacer = new DefaultRevisionReplacer(newRev, new Set([oldRev1]));
			const id = makeChangeAtomId(localId1, otherRev);
			const result = replacer.getUpdatedAtomId(id);
			assert.equal(result, id);
		});

		it("replaces old revision with new revision", () => {
			const replacer = new DefaultRevisionReplacer(newRev, new Set([oldRev1]));
			const id = makeChangeAtomId(localId1, oldRev1);
			const result = replacer.getUpdatedAtomId(id);
			assert.equal(result.revision, newRev);
			assert.equal(result.localId, id.localId);
		});

		it("reuses local IDs when no conflict exists", () => {
			const replacer = new DefaultRevisionReplacer(newRev, new Set([oldRev1]));
			const id1 = makeChangeAtomId(localId1, oldRev1);
			const id2 = makeChangeAtomId(localId2, oldRev1);
			const result1 = replacer.getUpdatedAtomId(id1);
			const result2 = replacer.getUpdatedAtomId(id2);
			assert.equal(result1.revision, newRev);
			assert.equal(result2.revision, newRev);
			assert.equal(result1.localId, id1.localId);
			assert.equal(result2.localId, id2.localId);
		});

		it("generates new local IDs when there is a conflict", () => {
			const replacer = new DefaultRevisionReplacer(newRev, new Set([oldRev1, oldRev2]));
			const id1 = makeChangeAtomId(localId1, oldRev1);
			const id2 = makeChangeAtomId(localId1, oldRev2);
			const result1 = replacer.getUpdatedAtomId(id1);
			const result2 = replacer.getUpdatedAtomId(id2);
			assert.equal(result1.localId, id1.localId);
			assert.notDeepEqual(result2, result1);
		});

		it("returns consistent updated ID for repeated calls with same old ID", () => {
			const replacer = new DefaultRevisionReplacer(newRev, new Set([oldRev1]));
			const result1 = replacer.getUpdatedAtomId(makeChangeAtomId(localId1, oldRev1));
			const result2 = replacer.getUpdatedAtomId(makeChangeAtomId(localId1, oldRev1));
			assert.deepEqual(result1, result2);
		});

		it("handles undefined old revision", () => {
			const replacer = new DefaultRevisionReplacer(newRev, new Set([undefined]));
			const id = makeChangeAtomId(localId1, undefined);
			const result = replacer.getUpdatedAtomId(id);
			assert.equal(result.revision, newRev);
		});

		it("preserves properties of generic ChangeAtomId type", () => {
			interface ExtendedChangeAtomId extends ChangeAtomId {
				extra: string;
			}
			const replacer = new DefaultRevisionReplacer(newRev, new Set([oldRev1]));
			const id: ExtendedChangeAtomId = {
				localId: localId1,
				revision: oldRev1,
				extra: "test",
			};
			const result = replacer.getUpdatedAtomId(id);
			assert.notEqual(result, id);
			assert.equal(result.extra, "test");
			assert.equal(result.revision, newRev);
		});
	});

	describe("addOldRevision", () => {
		it("affects which revisions are considered old", () => {
			const replacer = new DefaultRevisionReplacer(newRev);
			replacer.addOldRevision(oldRev1);
			assert.equal(replacer.isOldRevision(oldRev1), true);
			const id = makeChangeAtomId(localId1, oldRev1);
			const result = replacer.getUpdatedAtomId(id);
			assert.equal(result.revision, newRev);
			assert.equal(result.localId, id.localId);
		});

		it("throws when it detects a pattern of replacement that is inconsistent", () => {
			const replacer = new DefaultRevisionReplacer(newRev);
			assert.equal(replacer.isOldRevision(oldRev1), false);
			assert.throws(() => replacer.addOldRevision(oldRev1));
		});
	});
});

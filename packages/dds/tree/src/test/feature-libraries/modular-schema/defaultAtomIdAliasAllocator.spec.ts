/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ChangesetLocalId, RevisionTag } from "../../../core/index.js";

import { brand } from "../../../util/index.js";
import { DefaultAtomIdAliasAllocator } from "../../../feature-libraries/index.js";

describe("DefaultAtomIdAliasAllocator", () => {
	const revA: RevisionTag = "RevA" as RevisionTag;
	const revB: RevisionTag = "RevB" as RevisionTag;
	const revC: RevisionTag = "RevC" as RevisionTag;
	const noLocalId = brand<ChangesetLocalId>(-1);
	const localId0 = brand<ChangesetLocalId>(0);
	const localId1 = brand<ChangesetLocalId>(1);
	const localId2 = brand<ChangesetLocalId>(2);

	function assertContiguous(aliases: number[]) {
		for (let i = 1; i < aliases.length; i++) {
			assert.strictEqual(aliases[i], aliases[i - 1] + 1);
		}
	}

	function assertUnique(aliases: number[]) {
		const seen = new Set<number>();
		for (const alias of aliases) {
			assert(!seen.has(alias), `Alias ${alias} is not unique`);
			seen.add(alias);
		}
	}
	const permutations = [
		[revA, revB, revC],
		[revA, revC, revB],
		[revB, revA, revC],
		[revB, revC, revA],
		[revC, revA, revB],
		[revC, revB, revA],
	];

	const maxIdPerRevision: Map<RevisionTag, ChangesetLocalId> = new Map([
		[revA, localId2],
		[revB, localId0],
		[revC, localId1],
	]);

	const testModifiers = [
		{ testRevisionsWithoutIds: false, testExtraAllocations: false },
		{ testRevisionsWithoutIds: true, testExtraAllocations: false },
		{ testRevisionsWithoutIds: false, testExtraAllocations: true },
		{ testRevisionsWithoutIds: true, testExtraAllocations: true },
	];

	const extraBlockSize = 100;

	for (const testModifier of testModifiers) {
		describe(`should correctly reserve and return aliases ${JSON.stringify(testModifier)}`, () => {
			for (const reserveOrder of permutations) {
				it(`order: ${reserveOrder.join(", ")}`, () => {
					const allocator = new DefaultAtomIdAliasAllocator();

					const extras: number[] = [];

					for (const revision of reserveOrder) {
						allocator.reserve(
							revision,
							maxIdPerRevision.get(revision) ?? assert.fail("Missing max ID for revision"),
						);
						// Test that revisions with no reserved local IDs are handled correctly
						if (testModifier.testRevisionsWithoutIds) {
							allocator.reserve(`${revision}-no-ID` as RevisionTag, noLocalId);
						}
						// Test that extra ID can be allocated
						if (testModifier.testExtraAllocations) {
							extras.push(allocator.allocate(extraBlockSize));
						}
					}

					const aliasA0 = allocator.getAlias(revA, localId0);
					const aliasA1 = allocator.getAlias(revA, localId1);
					const aliasA2 = allocator.getAlias(revA, localId2);
					assertContiguous([aliasA0, aliasA1, aliasA2]);

					const aliasB0 = allocator.getAlias(revB, localId0);

					const aliasC0 = allocator.getAlias(revC, localId0);
					const aliasC1 = allocator.getAlias(revC, localId1);
					assertContiguous([aliasC0, aliasC1]);

					const allAliases = [aliasA0, aliasA1, aliasA2, aliasB0, aliasC0, aliasC1];
					assertUnique(allAliases);

					if (testModifier.testExtraAllocations) {
						assertUnique(extras);
						for (const extra of extras) {
							for (const alias of allAliases) {
								assert(alias < extra || alias >= extra + extraBlockSize);
							}
						}
					}

					// Check that the aliases remain consistent
					assert.equal(allocator.getAlias(revA, localId0), aliasA0);
					assert.equal(allocator.getAlias(revA, localId1), aliasA1);
					assert.equal(allocator.getAlias(revA, localId2), aliasA2);
					assert.equal(allocator.getAlias(revB, localId0), aliasB0);
					assert.equal(allocator.getAlias(revC, localId0), aliasC0);
					assert.equal(allocator.getAlias(revC, localId1), aliasC1);

					assert.equal(
						allocator.getMaxId(),
						5 + (testModifier.testExtraAllocations ? extraBlockSize * 3 : 0),
					);
				});
			}
		});
	}
});

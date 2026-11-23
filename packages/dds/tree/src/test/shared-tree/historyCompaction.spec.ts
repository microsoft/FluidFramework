/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { OldestSupportedClientVersion } from "@fluidframework/runtime-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { asAlpha } from "../../api.js";
import { FluidClientVersion } from "../../codec/index.js";
import { type ChangeRebaser, flattenCustomMetadata } from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import type { SharedTreeChange } from "../../shared-tree/index.js";
import type {
	HistoryCompactionPolicy,
	// eslint-disable-next-line import-x/no-internal-modules -- The callback type is internal to the draft engine.
} from "../../shared-tree-core/editManager.js";
import { TreeViewConfiguration } from "../../simple-tree/index.js";
import { configuredSharedTree } from "../../treeFactory.js";
import { StringArray, TestTreeProviderLite } from "../utils.js";

const config = new TreeViewConfiguration({ schema: StringArray });

const sameGroup: HistoryCompactionPolicy<SharedTreeChange> = (current, target) => {
	const before = flattenCustomMetadata(current.customMetadata);
	const after = flattenCustomMetadata(target.customMetadata);
	return before?.group !== undefined && before.group === after?.group;
};

function setupTree(
	retainHistory: boolean | number = true,
	minVersionForCollab: OldestSupportedClientVersion = "3.14.0",
) {
	const factory = configuredSharedTree({
		retainHistory,
		minVersionForCollab,
		jsonValidator: FormatValidatorBasic,
	}).getFactory();
	const provider = new TestTreeProviderLite(2, factory);
	const [tree, peer] = provider.trees;
	const view = asAlpha(tree.viewWith(config));
	view.initialize(["a", "b", "c"]);
	provider.synchronizeMessages();
	const other = peer.viewWith(config);

	/**
	 * Sequences edits from both clients to advance the collaboration window and age retained history.
	 */
	function advanceCollaboration(rounds = 1): void {
		provider.synchronizeMessages();
		for (let index = 0; index < rounds; index++) {
			view.root.insertAtEnd(`author ${index}`);
			provider.synchronizeMessages();
			other.root.insertAtEnd(`peer ${index}`);
			provider.synchronizeMessages();
		}
	}

	return { provider, tree, peer, view, other, advanceCollaboration };
}

function setupDeletedHistory() {
	const fixture = setupTree(6);
	for (let index = 0; index < 2; index++) {
		fixture.view.runTransaction(() => fixture.view.root.removeAt(0), {
			customMetadata: { group: "deletions" },
		});
	}
	fixture.advanceCollaboration();
	assert.equal(fixture.tree.kernel.checkout.getRemovedRoots().length, 2);
	return fixture;
}

// These executable regressions remain skipped until their correctness fixes are included.
describe("History compaction known bugs (fixes deferred)", () => {
	// Arrows point to parents: I <-- A <-- B <-- ... <-- HEAD.
	// I denotes initialization history; A/B/C denote the explicitly authored edits in each example.
	// The suffix contains collaboration-advancing edits with no custom metadata, so sameGroup rejects it.
	// M_g = { metadata: { group: g }, children: [] }; W(X, Y) = { metadata: undefined, children: [X, Y] }.
	// Absorbing A into B keeps graph revision B, but composed changes may still refer to A's namespace.
	// "Required" describes the deferred fix, not behavior guaranteed by this draft implementation.

	it.skip("collects repair roots when their surviving history is trimmed", () => {
		// Before: I <-- A[delete "a", M_deletions] <-- B[delete "b", M_deletions] <-- ... <-- HEAD.
		// After:  I <-- B[delete "a" and "b", W(M_deletions, M_deletions)] <-- ... <-- HEAD.
		// A leaves the graph; B keeps its revision. Both removed nodes are still needed as repair data.
		// Required: when later collaboration trims B, collect both roots, including the one created by A.
		// The uncompacted peer must also collect its roots when its corresponding history is trimmed.

		// Setup
		const { tree, peer, advanceCollaboration } = setupDeletedHistory();

		// Act
		const removed = tree.kernel.compactHistory(sameGroup);
		advanceCollaboration(10);

		// Verify
		assert.equal(removed, 1);
		assert.deepEqual(tree.kernel.checkout.getRemovedRoots(), []);
		assert.deepEqual(peer.kernel.checkout.getRemovedRoots(), []);
	});

	it.skip("preserves repair cleanup ownership across transaction abort", () => {
		// Before: I <-- A[delete "a", M_deletions] <-- B[delete "b", M_deletions] <-- ... <-- T (local HEAD).
		// T inserts "transaction edit" in an open transaction; T has no custom metadata.
		// Compact: I <-- B[delete "a" and "b", W(M_deletions, M_deletions)] <-- ... <-- T (local HEAD).
		// Abort removes T, not the already-sequenced deletions; B still survives and A is still absent.
		// Required: restoring transaction state must not restore repair cleanup ownership to removed A.
		// Once B leaves retained history, both "a" and "b" must leave repair storage.

		// Setup
		const { tree, peer, view, advanceCollaboration } = setupDeletedHistory();
		const checkout = tree.kernel.checkout;
		checkout.transaction.start();
		view.root.insertAtEnd("transaction edit");

		// Act
		const removed = tree.kernel.compactHistory(sameGroup);
		checkout.transaction.abort();
		advanceCollaboration(10);

		// Verify
		assert.equal(removed, 1);
		assert(![...view.root].includes("transaction edit"));
		assert.deepEqual(checkout.getRemovedRoots(), []);
		assert.deepEqual(peer.kernel.checkout.getRemovedRoots(), []);
	});

	it.skip("rejects a stale captured restore callback without changing content", () => {
		// Before: I <-- A[insert "edit 0", M_edits] <-- B[insert "edit 1", M_edits] <-- ... <-- HEAD.
		// Capture revertTo from the oldest retained initialization commit, before A/B.
		// After:  I <-- B[both inserts, W(M_edits, M_edits)] <-- ... <-- HEAD.
		// B keeps its revision; A is removed, so the captured history path is stale.
		// Required: calling that callback throws UsageError before undoing either insert or any later edit.

		// Setup
		const { tree, view, advanceCollaboration } = setupTree();
		for (let index = 0; index < 2; index++) {
			view.runTransaction(() => view.root.insertAtEnd(`edit ${index}`), {
				customMetadata: { group: "edits" },
			});
		}
		advanceCollaboration();
		let initial = view.branchHistory.getHead();
		while (initial?.getParent() !== undefined) {
			initial = initial.getParent();
		}
		const revert = initial?.revertTo ?? assert.fail("Expected a retained restore callback");
		const content = [...view.root];
		let error: unknown;

		// Act
		tree.kernel.compactHistory(sameGroup);
		try {
			revert();
		} catch (error_) {
			error = error_;
		}

		// Verify
		assert(error instanceof UsageError);
		assert.deepEqual([...view.root], content);
	});

	it.skip("encodes multiple revision namespaces in a compacted summary", async () => {
		// Before: I <-- A[insert "edit 0", M_edits] <-- B[insert "edit 1", M_edits] <-- ... <-- HEAD.
		// After:  I <-- B[both inserts, W(M_edits, M_edits)] <-- ... <-- HEAD.
		// The graph has only B for this pair, but its composed change carries namespaces A and B.
		// Required: summary encoding accepts both namespaces under graph revision B and its combined metadata.
		// The successful pre-compaction summary distinguishes this from an unrelated serialization failure.

		// Setup
		const { tree, view, advanceCollaboration } = setupTree();
		for (let index = 0; index < 2; index++) {
			view.runTransaction(() => view.root.insertAtEnd(`edit ${index}`), {
				customMetadata: { group: "edits" },
			});
		}
		advanceCollaboration();
		await tree.summarize();

		// Act
		const removed = tree.kernel.compactHistory(sameGroup);
		const summary = tree.summarize();

		// Verify
		assert.equal(removed, 1);
		await assert.doesNotReject(summary);
	});

	it.skip("rejects older-compatible compaction without mutating or breaking the tree", () => {
		// Before: I <-- A[insert "edit 0", M_edits] <-- B[insert "edit 1", M_edits] <-- ... <-- HEAD.
		// Readers as old as v2_117 are allowed, so this request must not produce a multi-namespace B.
		// Required after rejection: the same chain, revision count, and separate M_edits trees.
		// No policy call or partial A-into-B mutation is allowed.
		// A subsequent S[insert "still usable"] must extend HEAD normally and synchronize successfully.

		// Setup
		const { tree, view, provider, advanceCollaboration } = setupTree(
			true,
			FluidClientVersion.v2_117,
		);
		for (let index = 0; index < 2; index++) {
			view.runTransaction(() => view.root.insertAtEnd(`edit ${index}`), {
				customMetadata: { group: "edits" },
			});
		}
		advanceCollaboration();
		const before = view.branchHistory.length;
		let calls = 0;
		let error: unknown;

		// Act
		try {
			tree.kernel.compactHistory((current, target) => {
				calls++;
				return sameGroup(current, target);
			});
		} catch (error_) {
			error = error_;
		}

		// Verify
		assert(error instanceof UsageError);
		assert.equal(calls, 0);
		assert.equal(view.branchHistory.length, before);
		assert.doesNotThrow(() => view.root.insertAtEnd("still usable"));
		provider.synchronizeMessages();
		assert.equal(view.root.at(-1), "still usable");
	});

	it.skip("isolates composition failures and does not retry the failed pair", () => {
		// Before: I <-- A["edit 0", M_edits] <-- B["edit 1", M_edits] <-- C["edit 2", M_edits] <-- ... <-- HEAD.
		// First merge: I <-- B[edits 0+1, W(M_edits, M_edits)] <-- C["edit 2", M_edits] <-- ... <-- HEAD.
		// Composing B into C throws before C can absorb B's change or metadata.
		// Required: keep that intermediate chain (A removed, B/C retained), return 1, and suppress the error.
		// A second pass must not retry (B, C): return 0, leaving C's revision/change/metadata unchanged.

		// Setup
		const { tree, view, advanceCollaboration } = setupTree();
		for (let index = 0; index < 3; index++) {
			view.runTransaction(() => view.root.insertAtEnd(`edit ${index}`), {
				customMetadata: { group: "edits" },
			});
		}
		const failingRevision = tree.kernel.checkout.getLocationHead().revision;
		advanceCollaboration();
		const { changeFamily } = tree.kernel as unknown as {
			readonly changeFamily: { readonly rebaser: ChangeRebaser<SharedTreeChange> };
		};
		const { rebaser } = changeFamily;
		const originalCompose = rebaser.compose;
		let failures = 0;
		rebaser.compose = (changes) => {
			if (changes.length === 2 && changes[1].revision === failingRevision) {
				failures++;
				throw new Error("injected composition failure");
			}
			return originalCompose.call(rebaser, changes);
		};
		let removed: number | undefined;
		let repeated: number | undefined;
		let error: unknown;

		// Act
		try {
			removed = tree.kernel.compactHistory(sameGroup);
			repeated = tree.kernel.compactHistory(sameGroup);
		} catch (error_) {
			error = error_;
		} finally {
			rebaser.compose = originalCompose;
		}

		// Verify
		assert.equal(error, undefined);
		assert.equal(removed, 1);
		assert.equal(repeated, 0);
		assert.equal(failures, 1);
	});
});

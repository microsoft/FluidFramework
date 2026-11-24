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
	// Example: A <-- B <-- C <-- ... <-- HEAD; arrows point toward older commits.
	// Initialization history is omitted; A/B/C denote the explicitly authored edits in each example.
	// HEAD marks the newest commit, not an additional commit.
	// The suffix contains collaboration-advancing edits with no custom metadata, so sameGroup rejects it.
	// A+B denotes one combined commit keeping B's revision, with both original metadata trees as children.
	// Its composed change may still refer to A's revision namespace.
	// "Required" describes the deferred fix, not behavior guaranteed by this draft implementation.

	it.skip("frees deleted-node data when the combined commit is removed from retained history", () => {
		// Before: A <-- B <-- ... <-- HEAD.
		// A deletes "a"; B deletes "b"; both have metadata { group: "deletions" }.
		// After:  A+B <-- ... <-- HEAD.
		// A+B keeps B's revision. Both removed nodes are still needed as repair data.
		// Required: when later collaboration trims A+B, collect both roots, including the one created by A.
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

	it.skip("still frees deleted-node data after compaction followed by a transaction abort", () => {
		// Before: A <-- B <-- ... <-- T <-- HEAD.
		// A deletes "a"; B deletes "b"; both have metadata { group: "deletions" }.
		// T inserts "transaction edit" in an open transaction; T has no custom metadata.
		// Compact: A+B <-- ... <-- T <-- HEAD.
		// Abort removes T, not the already-sequenced deletions; A+B still survives under B's revision.
		// Required: restoring transaction state must not restore repair cleanup ownership to removed A.
		// Once A+B leaves retained history, both "a" and "b" must leave repair storage.

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

	it.skip("rejects a restore callback saved before compaction and leaves document content unchanged", () => {
		// Before: A <-- B <-- ... <-- HEAD.
		// A inserts "edit 0"; B inserts "edit 1"; both have metadata { group: "edits" }.
		// Capture revertTo from the oldest retained initialization commit, before A/B.
		// After:  A+B <-- ... <-- HEAD.
		// A+B keeps B's revision; A's separate commit is removed, so the captured history path is stale.
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

	it.skip("can summarize the tree after combining two insert commits", async () => {
		// Before: A <-- B <-- ... <-- HEAD.
		// A inserts "edit 0"; B inserts "edit 1"; both have metadata { group: "edits" }.
		// After:  A+B <-- ... <-- HEAD.
		// A+B keeps B's graph revision, but its composed change carries namespaces A and B.
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

	it.skip("rejects compaction when configured to support older clients and allows further edits", () => {
		// Before: A <-- B <-- ... <-- HEAD.
		// A inserts "edit 0"; B inserts "edit 1"; both have metadata { group: "edits" }.
		// Readers as old as v2_117 are allowed, so this request must not produce A+B with multiple namespaces.
		// Required after rejection: the same chain, revision count, and separate metadata trees.
		// No policy call or partial A-into-B mutation is allowed.
		// A subsequent commit inserting "still usable" must extend history normally and synchronize successfully.

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

	it.skip("keeps successful merges without throwing when a later merge fails and skips that pair on the next call", () => {
		// Before: A <-- B <-- C <-- ... <-- HEAD.
		// A/B/C insert "edit 0", "edit 1", and "edit 2"; all have metadata { group: "edits" }.
		// First merge: A+B <-- C <-- ... <-- HEAD.
		// Composing A+B into C throws before C can absorb the combined change or metadata.
		// Required: keep that intermediate chain, return 1, and suppress the error.
		// A second pass must not retry (A+B, C): return 0, leaving C's revision/change/metadata unchanged.

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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";

import { asAlpha } from "../../api.js";
import { FluidClientVersion } from "../../codec/index.js";
import type { RevisionTag } from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import { PersistedCommitMetadataIndex } from "../../shared-tree-core/index.js";
import {
	TreeViewConfiguration,
	type ITree,
	type TreeViewAlpha,
} from "../../simple-tree/index.js";
import { configuredSharedTree } from "../../treeFactory.js";
import { StringArray, TestTreeProviderLite, mintRevisionTag } from "../utils.js";

/**
 * A tree kind configured to write the format versions which carry persisted commit metadata.
 */
function metadataEnabledFactory(): IChannelFactory<ITree> {
	return configuredSharedTree({
		jsonValidator: FormatValidatorBasic,
		minVersionForCollab: FluidClientVersion.v3_0,
	}).getFactory();
}

const config = new TreeViewConfiguration({
	schema: StringArray,
	enableSchemaValidation: true,
});

/**
 * Subscribes to `view` and records the revision of each local commit it produces.
 */
function trackLocalRevisions(view: TreeViewAlpha<typeof StringArray>): {
	readonly revisions: RevisionTag[];
	off: () => void;
} {
	const revisions: RevisionTag[] = [];
	const off = view.events.on("changed", (data) => {
		if (data.isLocal) {
			revisions.push(data.revision);
		}
	});
	return { revisions, off };
}

/**
 * Runs `edit` inside a transaction annotated with `metadata` and returns the revision of the
 * commit that the transaction produced, or `undefined` if it produced no commit.
 */
function runAnnotatedTransaction(
	view: TreeViewAlpha<typeof StringArray>,
	metadata: { readonly [key: string]: string } | undefined,
	edit: () => void,
): RevisionTag | undefined {
	const tracker = trackLocalRevisions(view);
	try {
		view.runTransaction(edit, { persistedMetadata: metadata });
	} finally {
		tracker.off();
	}
	return tracker.revisions[tracker.revisions.length - 1];
}

describe("persisted commit metadata", () => {
	describe("PersistedCommitMetadataIndex", () => {
		it("stores, reads and removes entries by revision", () => {
			const index = new PersistedCommitMetadataIndex();
			const a = mintRevisionTag();
			const b = mintRevisionTag();
			assert.equal(index.get(a), undefined);
			index.set(a, { x: "1" });
			index.set(b, { x: "2" });
			assert.deepEqual(index.get(a), { x: "1" });
			assert.equal(index.size, 2);
			index.delete(a);
			assert.equal(index.get(a), undefined);
			index.deleteAll([b]);
			assert.equal(index.size, 0);
		});
	});

	it("is readable on the local client immediately", () => {
		const provider = new TestTreeProviderLite(1, metadataEnabledFactory());
		const view = asAlpha(provider.trees[0].viewWith(config));
		view.initialize(["A"]);

		const revision = runAnnotatedTransaction(view, { note: "insert B" }, () => {
			view.root.insertAt(1, "B");
		});

		assert(revision !== undefined);
		assert.deepEqual(view.getPersistedCommitMetadata(revision), { note: "insert B" });
	});

	it("is undefined for un-annotated commits", () => {
		const provider = new TestTreeProviderLite(1, metadataEnabledFactory());
		const view = asAlpha(provider.trees[0].viewWith(config));
		view.initialize(["A"]);

		const revision = runAnnotatedTransaction(view, undefined, () => {
			view.root.insertAt(1, "B");
		});

		assert(revision !== undefined);
		assert.equal(view.getPersistedCommitMetadata(revision), undefined);
	});

	it("replicates to a peer", () => {
		const provider = new TestTreeProviderLite(2, metadataEnabledFactory());
		const view1 = asAlpha(provider.trees[0].viewWith(config));
		view1.initialize(["A"]);
		provider.synchronizeMessages();
		const view2 = asAlpha(provider.trees[1].viewWith(config));

		const revision = runAnnotatedTransaction(view1, { note: "from peer 1" }, () => {
			view1.root.insertAt(1, "B");
		});
		provider.synchronizeMessages();

		assert(revision !== undefined);
		assert.deepEqual(view2.getPersistedCommitMetadata(revision), { note: "from peer 1" });
	});

	it("survives rebase over a concurrent remote commit", () => {
		const provider = new TestTreeProviderLite(2, metadataEnabledFactory());
		const view1 = asAlpha(provider.trees[0].viewWith(config));
		view1.initialize(["A"]);
		provider.synchronizeMessages();
		const view2 = asAlpha(provider.trees[1].viewWith(config));

		// Annotate a local commit on tree 1...
		const revision = runAnnotatedTransaction(view1, { note: "local" }, () => {
			view1.root.insertAt(1, "B");
		});
		// ...then sequence a concurrent commit from tree 2 ahead of it.
		view2.runTransaction(() => {
			view2.root.insertAt(0, "Z");
		});
		provider.synchronizeMessages();

		assert(revision !== undefined);
		// The revision tag is stable across rebase, so the metadata is still found.
		assert.deepEqual(view1.getPersistedCommitMetadata(revision), { note: "local" });
		assert.deepEqual(view2.getPersistedCommitMetadata(revision), { note: "local" });
	});

	it("is not written to the wire when minVersionForCollab is too old", () => {
		const provider = new TestTreeProviderLite(
			2,
			configuredSharedTree({
				jsonValidator: FormatValidatorBasic,
				minVersionForCollab: FluidClientVersion.v2_80,
			}).getFactory(),
		);
		const view1 = asAlpha(provider.trees[0].viewWith(config));
		view1.initialize(["A"]);
		provider.synchronizeMessages();
		const view2 = asAlpha(provider.trees[1].viewWith(config));

		const revision = runAnnotatedTransaction(view1, { note: "dropped" }, () => {
			view1.root.insertAt(1, "B");
		});
		provider.synchronizeMessages();

		assert(revision !== undefined);
		// The local client still has its own in-memory record...
		assert.deepEqual(view1.getPersistedCommitMetadata(revision), { note: "dropped" });
		// ...but nothing was written to the wire, so the peer has none.
		assert.equal(view2.getPersistedCommitMetadata(revision), undefined);
	});

	describe("transactions", () => {
		it("resolve to the outermost transaction's metadata when nested", () => {
			const provider = new TestTreeProviderLite(1, metadataEnabledFactory());
			const view = asAlpha(provider.trees[0].viewWith(config));
			view.initialize(["A"]);

			const tracker = trackLocalRevisions(view);
			view.runTransaction(
				() => {
					view.runTransaction(
						() => {
							view.root.insertAt(1, "B");
						},
						{ persistedMetadata: { note: "inner" } },
					);
				},
				{ persistedMetadata: { note: "outer" } },
			);
			tracker.off();

			const revision = tracker.revisions[tracker.revisions.length - 1];
			assert(revision !== undefined);
			assert.deepEqual(view.getPersistedCommitMetadata(revision), { note: "outer" });
		});

		it("discard metadata when the body makes no changes", () => {
			const provider = new TestTreeProviderLite(1, metadataEnabledFactory());
			const view = asAlpha(provider.trees[0].viewWith(config));
			view.initialize(["A"]);

			const tracker = trackLocalRevisions(view);
			// No commit is produced, so there is nothing for the metadata to describe.
			// This must not throw.
			view.runTransaction(() => {}, { persistedMetadata: { note: "no-op" } });
			tracker.off();

			assert.equal(tracker.revisions.length, 0);
			assert.deepEqual([...view.root], ["A"]);
		});

		it("discard metadata when explicitly rolled back", () => {
			const provider = new TestTreeProviderLite(1, metadataEnabledFactory());
			const view = asAlpha(provider.trees[0].viewWith(config));
			view.initialize(["A"]);

			const tracker = trackLocalRevisions(view);
			// A rolled back transaction produces no commit. This must not throw.
			view.runTransaction(
				() => {
					view.root.insertAt(1, "B");
					return { rollback: true };
				},
				{ persistedMetadata: { note: "rolled back" } },
			);
			tracker.off();

			assert.deepEqual([...view.root], ["A"]);
			for (const revision of tracker.revisions) {
				assert.equal(view.getPersistedCommitMetadata(revision), undefined);
			}
		});
	});

	describe("branches", () => {
		it("recorded on a fork is readable after the fork is merged", () => {
			const provider = new TestTreeProviderLite(2, metadataEnabledFactory());
			const view1 = asAlpha(provider.trees[0].viewWith(config));
			view1.initialize(["A"]);
			provider.synchronizeMessages();
			const view2 = asAlpha(provider.trees[1].viewWith(config));

			const fork = view1.fork();
			const revision = runAnnotatedTransaction(fork, { note: "on fork" }, () => {
				fork.root.insertAt(1, "B");
			});
			assert(revision !== undefined);
			assert.deepEqual(fork.getPersistedCommitMetadata(revision), { note: "on fork" });

			view1.merge(fork);
			assert.deepEqual(view1.getPersistedCommitMetadata(revision), { note: "on fork" });

			provider.synchronizeMessages();
			assert.deepEqual(view2.getPersistedCommitMetadata(revision), { note: "on fork" });
		});

		it("recorded on a fork survives disposal of that fork", () => {
			const provider = new TestTreeProviderLite(1, metadataEnabledFactory());
			const view1 = asAlpha(provider.trees[0].viewWith(config));
			view1.initialize(["A"]);

			const fork = view1.fork();
			const revision = runAnnotatedTransaction(fork, { note: "on fork" }, () => {
				fork.root.insertAt(1, "B");
			});
			assert(revision !== undefined);
			view1.merge(fork, true /* disposeView */);

			assert.deepEqual(view1.getPersistedCommitMetadata(revision), { note: "on fork" });
		});
	});
});

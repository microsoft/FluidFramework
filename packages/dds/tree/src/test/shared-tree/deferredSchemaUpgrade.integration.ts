/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	CommitKind,
	type GraphCommit,
	type RevisionTag,
	revisionMetadataSourceFromInfo,
	tagChange,
} from "../../core/index.js";
import { DefaultRevisionReplacer } from "../../feature-libraries/index.js";
import { ForestTypeOptimized, type SharedTreeChange } from "../../shared-tree/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	toUpgradeSchema,
} from "../../simple-tree/index.js";

import { expectSchemaEqual, SharedTreeTestFactory, TestTreeProviderLite } from "../utils.js";

const factory = new SchemaFactory("deferredSchemaUpgrade");
const oldSchema = factory.array("Root", factory.string);
const newSchema = factory.array("Root", [factory.string, factory.number]);
const oldConfig = new TreeViewConfiguration({ schema: oldSchema });
const newConfig = new TreeViewConfiguration({ schema: newSchema });

/**
 * Creates two synchronized clients and a private view that requires an upgrade.
 * The caller owns the views and the private checkout.
 */
function createScenario() {
	const provider = new TestTreeProviderLite(
		2,
		new SharedTreeTestFactory(() => {}, undefined, { forest: ForestTypeOptimized }),
	);
	const remote = provider.trees[0].kernel.viewWith(oldConfig);
	remote.initialize(["A", "B"]);
	provider.synchronizeMessages();
	const localTree = provider.trees[1];
	const base = localTree.kernel.checkout;
	const view = base.fork().viewWith(newConfig);
	const mintRevision = (): RevisionTag =>
		provider.getCompressor(localTree).generateCompressedId();
	return { provider, remote, base, view, mintRevision };
}

/**
 * Characterizes the branch and change-family primitives needed by deferred upgrades.
 * These tests do not enable or implement the deferred-upgrade API.
 */
describe("deferred schema upgrades: branch primitives", () => {
	it("keeps the base schema and outgoing queue unchanged after a private upgrade", () => {
		const { provider, remote, base, view } = createScenario();
		const baseHead = base.mainBranch.getHead();
		try {
			assert.equal(view.compatibility.canView, false);

			view.upgradeSchema();

			assert.deepEqual([...view.root], ["A", "B"]);
			assert.equal(view.compatibility.isEquivalent, true);
			assert.equal(
				base.mainBranch.getHead(),
				baseHead,
				"The private upgrade changed base history.",
			);
			expectSchemaEqual(base.storedSchema, toUpgradeSchema(oldSchema));
			assert.equal(
				provider.peekNextMessage(),
				undefined,
				"The private upgrade submitted an op.",
			);
		} finally {
			view.dispose();
			remote.dispose();
		}
	});

	it("preserves separate schema and data commits during ordinary merge", () => {
		const { provider, remote, base, view } = createScenario();
		const appended: GraphCommit<SharedTreeChange>[] = [];
		const off = base.mainBranch.events.on("beforeChange", (event) => {
			if (event.type === "append") {
				appended.push(...event.newCommits);
			}
		});
		try {
			view.upgradeSchema();
			view.root.insertAtEnd(1);

			base.merge(view, false);

			assert.deepEqual(
				appended.map((commit) => commit.change.changes.map((change) => change.type)),
				[["schema"], ["data"]],
				"Ordinary merge must not be mistaken for an atomic schema/data commit.",
			);
			provider.synchronizeMessages();
			assert.equal(view.disposed, false, "The source view must remain alive.");
		} finally {
			off();
			view.dispose();
			remote.dispose();
		}
	});

	it("publishes an earlier schema commit and later data commit as one composed change", () => {
		const { provider, remote, base, view, mintRevision } = createScenario();
		const appended: GraphCommit<SharedTreeChange>[] = [];
		const off = base.mainBranch.events.on("beforeChange", (event) => {
			if (event.type === "append") {
				appended.push(...event.newCommits);
			}
		});
		try {
			view.upgradeSchema();
			const schemaCommit = view.checkout.mainBranch.getHead();
			view.root.insertAtEnd(1);
			const dataCommit = view.checkout.mainBranch.getHead();
			const rebaser = base.mainBranch.changeFamily.rebaser;
			const composed = rebaser.compose([schemaCommit, dataCommit]);
			const revision = mintRevision();
			const change = rebaser.changeRevision(
				composed,
				new DefaultRevisionReplacer(revision, rebaser.getRevisions(composed)),
			);

			base.mainBranch.apply(tagChange(change, revision), CommitKind.Default, undefined);
			provider.synchronizeMessages();

			assert.equal(appended.length, 1, "Publication must append exactly one commit.");
			assert.deepEqual(
				change.changes.map((inner) => inner.type),
				["schema", "data"],
			);
			expectSchemaEqual(base.storedSchema, toUpgradeSchema(newSchema));
			assert.deepEqual(
				base.exportVerbose(),
				provider.trees[0].kernel.checkout.exportVerbose(),
			);
			assert.deepEqual([...view.root], ["A", "B", 1]);
		} finally {
			off();
			view.dispose();
			remote.dispose();
		}
	});

	it("currently replaces view nodes when reconciling composed publication history", () => {
		const { provider, remote, base, view, mintRevision } = createScenario();
		try {
			view.upgradeSchema();
			const schemaCommit = view.checkout.mainBranch.getHead();
			const root = view.root;
			view.root.insertAtEnd(1);
			const dataCommit = view.checkout.mainBranch.getHead();
			const rebaser = base.mainBranch.changeFamily.rebaser;
			const composed = rebaser.compose([schemaCommit, dataCommit]);
			const revision = mintRevision();
			const change = rebaser.changeRevision(
				composed,
				new DefaultRevisionReplacer(revision, rebaser.getRevisions(composed)),
			);
			base.mainBranch.apply(tagChange(change, revision), CommitKind.Default, undefined);
			provider.synchronizeMessages();

			view.checkout.rebaseOnto(base);

			assert.equal(
				view.root === root,
				false,
				"Ordinary rebase currently disposes the view's nodes during schema transitions.",
			);
			view.root.insertAtEnd(2);
			base.merge(view, false);
			provider.synchronizeMessages();
			assert.deepEqual([...view.root], ["A", "B", 1, 2]);
		} finally {
			view.dispose();
			remote.dispose();
		}
	});

	it("retains the original data change on a separate branch when rebase drops the upgrade", () => {
		const { provider, remote, base, view } = createScenario();
		view.upgradeSchema();
		view.root.insertAtEnd(1);
		const original = view.checkout.mainBranch.getHead();
		const retained = view.checkout.mainBranch.fork();
		try {
			remote.root.insertAtStart("remote");
			provider.synchronizeMessages();

			view.checkout.rebaseOnto(base);

			assert.equal(view.compatibility.canView, false);
			assert.deepEqual(view.checkout.exportVerbose(), base.exportVerbose());
			assert.equal(retained.getHead(), original);
			assert.equal(
				original.change.changes[0]?.type,
				"data",
				"Recovery lost the original edit.",
			);
			assert.equal(provider.peekNextMessage(), undefined);
		} finally {
			retained.dispose();
			view.dispose();
			remote.dispose();
		}
	});

	it("rebases retained data over concurrent data before preparing a fresh schema upgrade", () => {
		const { provider, remote, base, view, mintRevision } = createScenario();
		view.upgradeSchema();
		view.root.insertAtEnd(1);
		const original = view.checkout.mainBranch.getHead();
		const retained = view.checkout.mainBranch.fork();
		try {
			remote.root.insertAtStart("remote");
			provider.synchronizeMessages();
			const remoteCommit = base.mainBranch.getHead();
			const rebaser = base.mainBranch.changeFamily.rebaser;
			const rebasedData = rebaser.rebase(
				original,
				remoteCommit,
				revisionMetadataSourceFromInfo([
					{ revision: remoteCommit.revision },
					{ revision: original.revision },
				]),
			);
			assert.equal(
				rebasedData.changes[0]?.type,
				"data",
				"The data-only rebase lost the edit.",
			);
			const revision = mintRevision();
			const data = rebaser.changeRevision(
				rebasedData,
				new DefaultRevisionReplacer(revision, new Set([original.revision])),
			);
			const change: SharedTreeChange = {
				changes: [
					{
						type: "schema",
						innerChange: {
							schema: { old: base.storedSchema.clone(), new: toUpgradeSchema(newSchema) },
							isInverse: false,
						},
					},
					...data.changes,
				],
			};

			base.mainBranch.apply(tagChange(change, revision), CommitKind.Default, undefined);
			provider.synchronizeMessages();

			remote.dispose();
			const updatedRemote = provider.trees[0].kernel.viewWith(newConfig);
			try {
				assert.deepEqual([...updatedRemote.root], ["remote", "A", "B", 1]);
				expectSchemaEqual(base.storedSchema, toUpgradeSchema(newSchema));
			} finally {
				updatedRemote.dispose();
			}
		} finally {
			retained.dispose();
			view.dispose();
			if (!remote.disposed) {
				remote.dispose();
			}
		}
	});

	it("inverts the data portion of a compound commit without reverting its schema", () => {
		const { provider, remote, base, view, mintRevision } = createScenario();
		try {
			view.runTransaction(() => {
				view.upgradeSchema();
				view.root.insertAtEnd(1);
			});
			const compound = view.checkout.mainBranch.getHead();
			base.merge(view, false);
			provider.synchronizeMessages();
			const rebaser = base.mainBranch.changeFamily.rebaser;
			const data: SharedTreeChange = {
				changes: compound.change.changes.filter((change) => change.type === "data"),
			};
			const revision = mintRevision();
			const inverse = rebaser.invert(tagChange(data, compound.revision), false, revision);

			base.mainBranch.apply(tagChange(inverse, revision), CommitKind.Undo, undefined);
			provider.synchronizeMessages();

			expectSchemaEqual(base.storedSchema, toUpgradeSchema(newSchema));
			assert(inverse.changes.every((change) => change.type === "data"));
			remote.dispose();
			const updatedRemote = provider.trees[0].kernel.viewWith(newConfig);
			try {
				assert.deepEqual([...updatedRemote.root], ["A", "B"]);
			} finally {
				updatedRemote.dispose();
			}
		} finally {
			view.dispose();
			if (!remote.disposed) {
				remote.dispose();
			}
		}
	});
});

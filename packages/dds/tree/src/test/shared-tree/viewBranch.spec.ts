/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { CommitOutcome } from "../../core/index.js";
import {
	decideViewSchema,
	retryViewPublication,
	settleViewPublication,
	type ViewPublicationState,
	ViewBranch,
	// eslint-disable-next-line import-x/no-internal-modules -- Tests the internal view-branch decisions.
} from "../../shared-tree/viewBranch.js";
import {
	SchemaFactoryBeta,
	SchemaFactoryAlpha,
	type ImplicitFieldSchema,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
	toUpgradeSchema,
} from "../../simple-tree/index.js";

import { expectSchemaEqual, mintRevisionTag, TestTreeProviderLite } from "../utils.js";

describe("viewBranch", () => {
	describe("persistent synchronization", () => {
		const sf = new SchemaFactoryBeta("viewBranchSynchronization");
		const config = new TreeViewConfiguration({ schema: sf.array("Root", sf.string) });

		function createSynchronizedViews() {
			const provider = new TestTreeProviderLite(2);
			const remote = provider.trees[0].kernel.viewWith(config);
			remote.initialize([]);
			provider.synchronizeMessages();
			const base = provider.trees[1].kernel.checkout;
			const branch = new ViewBranch(base);
			const view = branch.checkout.viewWith(config);
			return { provider, remote, base, branch, view };
		}

		it("publishes successive local edits without replacing the authoring view", () => {
			const { provider, remote, branch, view } = createSynchronizedViews();
			const root = view.root;
			try {
				root.insertAtEnd("first");
				provider.synchronizeMessages();
				root.insertAtEnd("second");
				provider.synchronizeMessages();

				assert.deepEqual([...remote.root], ["first", "second"]);
				assert.deepEqual([...root], ["first", "second"]);
				assert.equal(view.root === root, true, "Synchronization replaced the root node.");
			} finally {
				branch.dispose();
				remote.dispose();
			}
		});

		it("rebases remote edits into the view without echoing them to the base", () => {
			const { provider, remote, branch, view } = createSynchronizedViews();
			try {
				remote.root.insertAtEnd("remote");
				provider.synchronizeMessages();

				assert.deepEqual([...view.root], ["remote"]);
				assert.equal(provider.peekNextMessage(), undefined, "A remote edit was echoed back.");
			} finally {
				branch.dispose();
				remote.dispose();
			}
		});

		it("keeps transaction edits private and does not publish an abort", () => {
			const { provider, remote, branch, view } = createSynchronizedViews();
			try {
				const result = view.runTransaction(() => {
					view.root.insertAtEnd("cancelled");
					assert.equal(provider.peekNextMessage(), undefined);
					return { rollback: true };
				});

				assert.equal(result.success, false);
				assert.deepEqual([...view.root], []);
				assert.equal(provider.peekNextMessage(), undefined);
			} finally {
				branch.dispose();
				remote.dispose();
			}
		});

		it("reports remote changes once and forwards the settled outcome of local edits", () => {
			const { provider, remote, branch, view } = createSynchronizedViews();
			const origins: boolean[] = [];
			const outcomes: CommitOutcome[] = [];
			const off = view.events.on("changed", (metadata) => {
				origins.push(metadata.isLocal);
				if (metadata.isLocal) {
					metadata.events.on("settled", (outcome) => outcomes.push(outcome));
				}
			});
			try {
				view.root.insertAtEnd("local");
				provider.synchronizeMessages();
				remote.root.insertAtEnd("remote");
				provider.synchronizeMessages();

				assert.deepEqual(origins, [true, false], "Change origins were lost or duplicated.");
				assert.deepEqual(outcomes, [CommitOutcome.FullyApplied]);
			} finally {
				off();
				branch.dispose();
				remote.dispose();
			}
		});

		it("reconciles remote changes after an asynchronous transaction completes", async () => {
			const { provider, remote, branch, view } = createSynchronizedViews();
			try {
				await view.runTransactionAsync(async () => {
					view.root.insertAtEnd("local");
					remote.root.insertAtStart("remote");
					provider.synchronizeMessages();
					await Promise.resolve();
					assert.deepEqual([...view.root], ["local"], "The transaction was not isolated.");
				});
				provider.synchronizeMessages();

				assert.deepEqual([...view.root], [...remote.root]);
				assert.equal(view.root.length, 2, "A transaction or remote edit was lost.");
			} finally {
				branch.dispose();
				remote.dispose();
			}
		});

		it("disposes the private checkout without disposing the base", () => {
			const { remote, base, branch } = createSynchronizedViews();
			branch.dispose();
			assert.equal(branch.checkout.disposed, true);
			assert.equal(base.disposed, false);
			remote.dispose();
		});
	});

	describe("decideViewSchema", () => {
		const sf = new SchemaFactoryBeta("viewBranch");
		const v1 = sf.object("Root", { title: sf.string });
		const v2 = sf.object(
			"Root",
			{ title: sf.string, note: sf.optional(sf.string) },
			{ allowUnknownOptionalFields: true },
		);
		const v3 = sf.object("Root", {
			title: sf.string,
			note: sf.optional(sf.string),
			checked: sf.optional(sf.boolean),
		});

		it("adopts an equivalent received schema", () => {
			const schema = toUpgradeSchema(v2);
			assert.deepEqual(
				decideViewSchema(new TreeViewConfigurationAlpha({ schema: v2 }), schema, schema),
				{ type: "adopt", schema },
			);
		});

		it("keeps the upgrade when the received schema is insufficient", () => {
			const target = toUpgradeSchema(v3);
			assert.deepEqual(
				decideViewSchema(
					new TreeViewConfigurationAlpha({ schema: v3 }),
					toUpgradeSchema(v2),
					target,
				),
				{ type: "upgrade", schema: target },
			);
		});

		it("adopts a covering schema even when upgrading to the local target is not allowed", () => {
			const received = toUpgradeSchema(v3);
			assert.deepEqual(
				decideViewSchema(
					new TreeViewConfigurationAlpha({ schema: v2 }),
					received,
					toUpgradeSchema(v2),
				),
				{ type: "adopt", schema: received },
			);
		});

		it("does not mistake an incompatible expansion for a covering upgrade", () => {
			assert.deepEqual(
				decideViewSchema(
					new TreeViewConfigurationAlpha({ schema: v1 }),
					toUpgradeSchema(v3),
					toUpgradeSchema(v1),
				),
				{ type: "incompatible" },
			);
		});
	});

	describe("local schema upgrades", () => {
		const sf = new SchemaFactoryAlpha("viewBranchUpgrade");
		const configV1 = new TreeViewConfiguration({ schema: sf.array("Root", sf.string) });
		const configV2 = new TreeViewConfiguration({
			schema: sf.array("Root", [sf.string, sf.number]),
		});
		const configV3 = new TreeViewConfiguration({
			schema: sf.array("Root", [sf.string, sf.number, sf.boolean]),
		});

		function createUpgradableViews<TRoot extends ImplicitFieldSchema>(
			config: TreeViewConfiguration<TRoot>,
		) {
			const provider = new TestTreeProviderLite(2);
			const remote = provider.trees[0].kernel.viewWith(configV1);
			remote.initialize(["initial"]);
			provider.synchronizeMessages();
			const base = provider.trees[1].kernel.checkout;
			const branch = new ViewBranch(base);
			const view = branch.viewWith(config);
			return { provider, remote, base, branch, view };
		}

		it("applies an explicit upgrade locally without changing the base", () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(configV2);
			const baseHead = base.mainBranch.getHead();
			try {
				assert.equal(view.compatibility.canView, false);
				view.upgradeSchema();

				assert.equal(view.compatibility.isEquivalent, true);
				assert.deepEqual([...view.root], ["initial"]);
				assert.equal(
					base.mainBranch.getHead() === baseHead,
					true,
					"The base history changed.",
				);
				assert.equal(provider.peekNextMessage(), undefined);
			} finally {
				branch.dispose();
				remote.dispose();
			}
		});

		it("keeps the upgraded root stable while receiving remote data", () => {
			const { provider, remote, branch, view } = createUpgradableViews(configV2);
			try {
				view.upgradeSchema();
				const root = view.root;
				remote.root.insertAtEnd("remote");
				provider.synchronizeMessages();

				assert.equal(view.compatibility.canView, true);
				assert.equal(view.root === root, true, "A schema-only refresh replaced the root.");
				assert.deepEqual([...root], ["initial", "remote"]);
				assert.equal(provider.peekNextMessage(), undefined);
			} finally {
				branch.dispose();
				remote.dispose();
			}
		});

		it("reserves the base's single view until the controller is disposed", () => {
			const { remote, base, branch } = createUpgradableViews(configV2);
			try {
				assert.throws(() => base.viewWith(configV1), /second tree view/);
				branch.dispose();
				const replacement = base.viewWith(configV1);
				replacement.dispose();
			} finally {
				branch.dispose();
				remote.dispose();
			}
		});

		it("adopts an equivalent remote upgrade and publishes later edits without schema", () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(configV2);
			view.upgradeSchema();
			const root = view.root;
			remote.dispose();
			const updatedRemote = provider.trees[0].kernel.viewWith(configV2);
			try {
				updatedRemote.upgradeSchema();
				provider.synchronizeMessages();
				assert.equal(view.root === root, true);
				assert.equal(provider.peekNextMessage(), undefined);

				root.insertAtEnd(2);
				assert.deepEqual(
					base.mainBranch.getHead().change.changes.map((change) => change.type),
					["data"],
				);
				provider.synchronizeMessages();
				assert.deepEqual([...updatedRemote.root], ["initial", 2]);
			} finally {
				branch.dispose();
				updatedRemote.dispose();
			}
		});

		it("keeps a larger local upgrade pending after an insufficient remote upgrade", () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(configV3);
			view.upgradeSchema();
			const root = view.root;
			remote.dispose();
			const updatedRemote = provider.trees[0].kernel.viewWith(configV2);
			try {
				updatedRemote.upgradeSchema();
				provider.synchronizeMessages();

				assert.equal(view.root === root, true);
				assert.equal(view.compatibility.isEquivalent, true);
				expectSchemaEqual(base.storedSchema, toUpgradeSchema(configV2.schema));
				expectSchemaEqual(branch.checkout.storedSchema, toUpgradeSchema(configV3.schema));
				assert.equal(provider.peekNextMessage(), undefined);
			} finally {
				branch.dispose();
				updatedRemote.dispose();
			}
		});

		it("adopts a viewable covering remote schema without downgrading it", () => {
			const config = new TreeViewConfiguration({
				schema: sf.arrayAlpha(
					"Root",
					sf.types([sf.string, sf.number, SchemaFactoryAlpha.staged(sf.boolean)]),
				),
			});
			const { provider, remote, base, branch, view } = createUpgradableViews(config);
			view.upgradeSchema();
			const root = view.root;
			remote.dispose();
			const updatedRemote = provider.trees[0].kernel.viewWith(configV3);
			try {
				updatedRemote.upgradeSchema();
				provider.synchronizeMessages();

				assert.equal(view.root === root, true);
				assert.equal(view.compatibility.canView, true);
				assert.equal(view.compatibility.isEquivalent, false);
				assert.equal(provider.peekNextMessage(), undefined);
				root.insertAtEnd(2);
				assert.deepEqual(
					base.mainBranch.getHead().change.changes.map((change) => change.type),
					["data"],
				);
				provider.synchronizeMessages();
				expectSchemaEqual(base.storedSchema, toUpgradeSchema(configV3.schema));
			} finally {
				branch.dispose();
				updatedRemote.dispose();
			}
		});
	});

	describe("publication outcomes", () => {
		function initialPublication(): Extract<ViewPublicationState, { type: "pending" }> {
			return Object.freeze({
				type: "pending",
				revision: mintRevisionTag(),
				attempt: "initial",
			});
		}

		it("accepts a fully applied publication without requesting a retry", () => {
			const state = initialPublication();
			assert.deepEqual(
				settleViewPublication(state, state.revision, CommitOutcome.FullyApplied),
				{ type: "accepted", revision: state.revision },
			);
			assert.equal(state.type, "pending", "The reducer mutated its input.");
		});

		it("requests one retry after rejection and fails after the retry is rejected", () => {
			const initial = initialPublication();
			const rejected = settleViewPublication(
				initial,
				initial.revision,
				CommitOutcome.FullyDropped,
			);
			assert.equal(rejected.type, "retryRequired");
			assert(rejected.type === "retryRequired");
			const revision = mintRevisionTag();
			const retry = retryViewPublication(rejected, revision);

			assert.deepEqual(settleViewPublication(retry, revision, CommitOutcome.FullyDropped), {
				type: "failed",
				revision,
				reason: "retryRejected",
			});
		});

		it("counts a synchronization rollback against the same retry allowance", () => {
			const initial = initialPublication();
			const rolledBack = settleViewPublication(initial, initial.revision, "rollback");
			assert(rolledBack.type === "retryRequired");
			const revision = mintRevisionTag();
			const retry = retryViewPublication(rolledBack, revision);
			assert.deepEqual(settleViewPublication(retry, revision, "rollback"), {
				type: "failed",
				revision,
				reason: "retryRejected",
			});
		});

		it("does not retry a change whose constraints were violated", () => {
			const initial = initialPublication();
			assert.deepEqual(
				settleViewPublication(initial, initial.revision, CommitOutcome.NewContentOnly),
				{
					type: "failed",
					revision: initial.revision,
					reason: "constraintViolation",
				},
			);
		});

		it("ignores duplicate and stale outcomes", () => {
			const initial = initialPublication();
			assert.equal(
				settleViewPublication(initial, mintRevisionTag(), CommitOutcome.FullyDropped),
				initial,
			);
			const rejected = settleViewPublication(
				initial,
				initial.revision,
				CommitOutcome.FullyDropped,
			);
			assert(rejected.type === "retryRequired");
			assert.equal(
				settleViewPublication(rejected, initial.revision, CommitOutcome.FullyDropped),
				rejected,
			);
			const retry = retryViewPublication(rejected, mintRevisionTag());
			assert.equal(
				settleViewPublication(retry, initial.revision, CommitOutcome.FullyApplied),
				retry,
			);
			const accepted = settleViewPublication(
				retry,
				retry.revision,
				CommitOutcome.FullyApplied,
			);
			assert.equal(
				settleViewPublication(accepted, retry.revision, CommitOutcome.FullyDropped),
				accepted,
			);
		});
	});
});

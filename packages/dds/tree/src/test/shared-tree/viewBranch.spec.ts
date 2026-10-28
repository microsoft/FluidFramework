/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";
import { minimize } from "@fluidframework/tree/alpha";
import {
	MockContainerRuntime,
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils/internal";
import { FluidClientVersion } from "../../codec/index.js";
import {
	CommitKind,
	CommitOutcome,
	RevertibleStatus,
	type Revertible,
	type RevertibleAlpha,
	type RevisionTag,
} from "../../core/index.js";
import {
	decideViewSchema,
	getPublicationStatus,
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
	type InsertableField,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
	toUpgradeSchema,
	StagedSchemaUpgradePolicy,
} from "../../simple-tree/index.js";
import type { JsonCompatibleReadOnly } from "../../util/index.js";
import { createTreeCheckout, SchematizingSimpleTreeView } from "../../shared-tree/index.js";
import { configuredSharedTree, resolveOptions } from "../../treeFactory.js";

import {
	expectSchemaEqual,
	mintRevisionTag,
	SharedTreeTestFactory,
	TestTreeProviderLite,
	testIdCompressor,
	testRevisionTagCodec,
	TestTreeProvider,
	SummarizeType,
} from "../utils.js";

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
			provider = new TestTreeProviderLite(2),
		) {
			return createSchemaScenario(configV1, config, ["initial"], provider);
		}

		function createSchemaScenario<
			TBefore extends ImplicitFieldSchema,
			TAfter extends ImplicitFieldSchema,
		>(
			before: TreeViewConfiguration<TBefore>,
			after: TreeViewConfiguration<TAfter>,
			content: InsertableField<TBefore>,
			provider = new TestTreeProviderLite(2),
		) {
			const remote = provider.trees[0].kernel.viewWith(before);
			remote.initialize(content);
			provider.synchronizeMessages();
			const base = provider.trees[1].kernel.checkout;
			const branch = new ViewBranch(base);
			const view = branch.viewWith(after);
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

		it("publishes the first edit as separate ordered commits and keeps native undo", () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(configV2);
			const revisions: RevisionTag[] = [];
			const kinds: string[][] = [];
			const revertibles: Revertible[] = [];
			const offBase = base.mainBranch.events.on("beforeChange", (event) => {
				if (event.type === "append") {
					for (const commit of event.newCommits) {
						revisions.push(commit.revision);
						kinds.push(commit.change.changes.map((inner) => inner.type));
					}
				}
			});
			const offView = view.events.on("changed", (metadata) => {
				if (metadata.isLocal && metadata.kind === CommitKind.Default) {
					const revertible = metadata.getRevertible();
					if (revertible !== undefined) revertibles.push(revertible);
				}
			});
			try {
				view.upgradeSchema();
				const schemaRevision = branch.checkout.mainBranch.getHead().revision;
				const root = view.root;
				root.insertAtEnd(1);
				const dataRevision = branch.checkout.mainBranch.getHead().revision;
				assert.deepEqual(revisions, [schemaRevision, dataRevision]);
				assert.deepEqual(kinds, [["schema"], ["data"]]);
				provider.synchronizeMessages();
				assert.equal(view.root === root, true);
				assert.equal(revertibles.length, 1);
				revertibles[0].revert();
				provider.synchronizeMessages();
				assert.deepEqual([...root], ["initial"]);
				expectSchemaEqual(base.storedSchema, toUpgradeSchema(configV2.schema));
			} finally {
				offBase();
				offView();
				for (const revertible of revertibles) {
					if (revertible.status === RevertibleStatus.Valid) revertible.dispose();
				}
				branch.dispose();
				remote.dispose();
			}
		});

		it("keeps an earlier local upgrade after abort and publishes it with the next commit", () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(configV2);
			try {
				const before = base.mainBranch.getHead();
				view.upgradeSchema();
				const root = view.root;
				view.runTransaction(() => {
					root.insertAtEnd(1);
					return { rollback: true };
				});
				assert.equal(provider.peekNextMessage(), undefined);
				assert.equal(base.mainBranch.getHead() === before, true);
				assert.equal(view.compatibility.isEquivalent, true);
				view.runTransaction(() => root.insertAtEnd(2));
				provider.synchronizeMessages();
				assert.equal(view.root === root, true);
				assert.deepEqual([...root], ["initial", 2]);
				expectSchemaEqual(base.storedSchema, toUpgradeSchema(configV2.schema));
			} finally {
				branch.dispose();
				remote.dispose();
			}
		});

		it("does not leave either checkout usable if submission fails between the two commits", () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(configV2);
			view.upgradeSchema();
			const kernel = provider.trees[1].kernel;
			const originalSubmit = kernel.submitLocalMessage;
			const descriptor = Object.getOwnPropertyDescriptor(kernel, "submitLocalMessage");
			assert(descriptor !== undefined);
			const failure = new Error("Data submission failed.");
			let submitted = 0;
			const submit: typeof originalSubmit = (content, metadata) => {
				submitted++;
				if (submitted === 2) throw failure;
				originalSubmit(content, metadata);
			};
			Object.defineProperty(kernel, "submitLocalMessage", { ...descriptor, value: submit });
			try {
				assert.throws(
					() => view.root.insertAtEnd(1),
					(error: unknown) => error === failure,
				);
				assert.equal(submitted, 2, "The test must fail after the schema submission.");
				assert.throws(() => base.breaker.use(), /invalid state/);
				assert.throws(() => branch.checkout.breaker.use(), /invalid state/);
			} finally {
				Object.defineProperty(kernel, "submitLocalMessage", descriptor);
				// The checkouts are deliberately broken and cannot perform normal view disposal.
				remote.dispose();
			}
		});

		it("retries a rejected schema/data publication once without rerunning application code", () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(configV2);
			const submitted: string[][] = [];
			const outcomes: CommitOutcome[] = [];
			let callbacks = 0;
			const offBase = base.mainBranch.events.on("beforeChange", (event) => {
				if (event.type === "append")
					submitted.push(
						...event.newCommits.map((commit) =>
							commit.change.changes.map((inner) => inner.type),
						),
					);
			});
			const offView = view.events.on("changed", (metadata) => {
				if (metadata.isLocal)
					metadata.events.on("settled", (outcome) => outcomes.push(outcome));
			});
			try {
				view.upgradeSchema();
				const root = view.root;
				remote.root.insertAtStart("remote");
				view.runTransaction(() => {
					callbacks++;
					root.insertAtEnd(1);
				});
				provider.synchronizeMessages();
				// The first delivery schedules the retry; the next delivery settles it.
				provider.synchronizeMessages();

				assert.equal(callbacks, 1);
				assert.equal(view.root === root, true);
				assert.deepEqual([...root], ["remote", "initial", 1]);
				assert.deepEqual(submitted, [["schema"], ["data"], ["schema"], ["data"]]);
				assert.deepEqual(outcomes, [CommitOutcome.FullyApplied, CommitOutcome.FullyApplied]);
				assert.deepEqual(
					base.exportVerbose(),
					provider.trees[0].kernel.checkout.exportVerbose(),
				);
			} finally {
				offBase();
				offView();
				branch.dispose();
				remote.dispose();
			}
		});

		it("recovers dependent edits and omits schema when an equivalent remote upgrade wins", () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(configV2);
			remote.dispose();
			const upgradedRemote = provider.trees[0].kernel.viewWith(configV2);
			const submissions: string[][] = [];
			const off = base.mainBranch.events.on("beforeChange", (event) => {
				if (event.type === "append")
					submissions.push(
						...event.newCommits.map((commit) =>
							commit.change.changes.map((inner) => inner.type),
						),
					);
			});
			try {
				view.upgradeSchema();
				upgradedRemote.upgradeSchema();
				view.root.insertAtEnd(1);
				view.root.insertAtEnd(2);
				provider.synchronizeMessages();
				provider.synchronizeMessages();

				assert.deepEqual([...view.root], ["initial", 1, 2]);
				assert.deepEqual([...upgradedRemote.root], ["initial", 1, 2]);
				assert.deepEqual(submissions, [["schema"], ["data"], ["data"], ["data"], ["data"]]);
			} finally {
				off();
				branch.dispose();
				upgradedRemote.dispose();
			}
		});

		it("preserves inserted objects and dependent edits through recovery", () => {
			class Note extends sf.object("Note", { text: sf.string }) {}
			const config = new TreeViewConfiguration({
				schema: sf.array("Root", [sf.string, Note]),
			});
			const { provider, remote, base, branch, view } = createUpgradableViews(config);
			try {
				view.upgradeSchema();
				remote.root.insertAtStart("remote");
				const note = new Note({ text: "initial note" });
				view.root.insertAtEnd(note);
				// This second commit refers to a node created by the rejected first attempt.
				note.text = "edited note";
				provider.synchronizeMessages();
				provider.synchronizeMessages();

				assert.equal(
					view.root[2] === note,
					true,
					"Recovery replaced an application-owned object.",
				);
				assert.equal(note.text, "edited note");
				note.text = "after recovery";
				provider.synchronizeMessages();
				assert.deepEqual(
					base.exportVerbose(),
					provider.trees[0].kernel.checkout.exportVerbose(),
				);
			} finally {
				branch.dispose();
				remote.dispose();
			}
		});

		it("keeps detached objects and native undo/redo usable after recovery", () => {
			class Note extends sf.object("DetachedNote", { text: sf.string }) {}
			const config = new TreeViewConfiguration({
				schema: sf.array("Root", [sf.string, Note]),
			});
			const { provider, remote, base, branch, view } = createUpgradableViews(config);
			const revertibles: Revertible[] = [];
			const off = view.events.on("changed", (metadata) => {
				if (metadata.isLocal) {
					const revertible = metadata.getRevertible();
					if (revertible !== undefined) {
						revertibles.push(revertible);
					}
				}
			});
			try {
				view.upgradeSchema();
				remote.root.insertAtStart("remote");
				const note = new Note({ text: "kept for undo" });
				view.root.insertAtEnd(note);
				view.root.removeAt(1);
				provider.synchronizeMessages();
				provider.synchronizeMessages();

				assert.equal(revertibles.length, 2, "Recovery exposed additional undo handles.");
				assert.equal(note.text, "kept for undo");
				revertibles[1].revert();
				assert.equal(view.root[2] === note, true, "Undo did not restore the same object.");
				provider.synchronizeMessages();
				revertibles[2].revert();
				provider.synchronizeMessages();
				assert.deepEqual([...view.root], ["remote", "initial"]);
				expectSchemaEqual(base.storedSchema, toUpgradeSchema(config.schema));
				assert.deepEqual(
					base.exportVerbose(),
					provider.trees[0].kernel.checkout.exportVerbose(),
				);
			} finally {
				off();
				for (const revertible of revertibles) {
					if (revertible.status === RevertibleStatus.Valid) {
						revertible.dispose();
					}
				}
				branch.dispose();
				remote.dispose();
			}
		});

		for (const forkBeforeRetry of [true, false]) {
			it(`clones a recovered undo handle to a fork created ${forkBeforeRetry ? "before" : "after"} retry`, () => {
				const { provider, remote, branch, view } = createUpgradableViews(configV2);
				let undo: RevertibleAlpha | undefined;
				const off = view.events.on("changed", (metadata) => {
					if (metadata.isLocal && metadata.kind === CommitKind.Default) {
						undo = metadata.getRevertible();
					}
				});
				view.upgradeSchema();
				remote.root.insertAtStart("remote");
				view.root.insertAtEnd(1);
				assert(undo !== undefined);
				off();
				let fork = forkBeforeRetry ? branch.checkout.fork() : undefined;
				try {
					provider.synchronizeMessages();
					provider.synchronizeMessages();
					fork ??= branch.checkout.fork();
					const forkView = fork.viewWith(configV2);
					const cloned = undo.clone(fork);
					cloned.revert();
					assert.deepEqual(
						[...forkView.root],
						forkBeforeRetry ? ["initial"] : ["remote", "initial"],
					);
					assert.deepEqual([...view.root], ["remote", "initial", 1]);
					undo.revert();
					provider.synchronizeMessages();
					assert.deepEqual([...view.root], ["remote", "initial"]);
				} finally {
					if (undo.status === RevertibleStatus.Valid) {
						undo.dispose();
					}
					fork?.dispose();
					branch.dispose();
					remote.dispose();
				}
			});
		}

		it("fails after a rejected retry without submitting a third attempt", () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(configV2);
			let submitted = 0;
			let sequenced = 0;
			const offChanges = base.mainBranch.events.on("beforeChange", (event) => {
				if (event.type === "append") submitted += event.newCommits.length;
			});
			const offSequenced = base.mainBranch.events.on("commitSequenced", () => {
				if (++sequenced === 2) {
					// Queue a second concurrent edit before the post-sequencing recovery runs.
					remote.root.insertAtStart("second remote");
				}
			});
			try {
				view.upgradeSchema();
				remote.root.insertAtStart("first remote");
				view.root.insertAtEnd(1);
				provider.synchronizeMessages();
				assert.equal(submitted, 4);
				assert.throws(() => provider.synchronizeMessages(), /failed after retry/);
				assert.equal(submitted, 4, "The controller submitted a third attempt.");
				assert.throws(() => branch.checkout.breaker.use(), /invalid state/);
				assert.throws(() => base.breaker.use(), /invalid state/);
			} finally {
				offChanges();
				offSequenced();
				remote.dispose();
			}
		});

		it("fails before retry submission when reconstruction violates an application constraint", () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(
				configV2,
				new TestTreeProviderLite(
					2,
					new SharedTreeTestFactory(() => {}, undefined, {
						minVersionForCollab: FluidClientVersion.v2_80,
					}),
				),
			);
			let submitted = 0;
			const off = base.mainBranch.events.on("beforeChange", (event) => {
				if (event.type === "append") {
					submitted += event.newCommits.length;
				}
			});
			try {
				view.upgradeSchema();
				remote.root.insertAtStart("remote");
				view.runTransaction(() => {
					branch.checkout.editor.addNoChangeConstraint();
					view.root.insertAtEnd(1);
				});
				assert.throws(
					() => provider.synchronizeMessages(),
					/recovery is unsafe: constraintViolation/,
				);
				assert.equal(submitted, 2, "An unsafe retry reached submission.");
				assert.throws(() => branch.checkout.breaker.use(), /invalid state/);
				assert.throws(() => base.breaker.use(), /invalid state/);
			} finally {
				off();
				remote.dispose();
			}
		});

		it("retains rejected work through reconnect without treating resubmission as a retry", () => {
			class Note extends sf.object("OfflineNote", { text: sf.string }) {}
			const config = new TreeViewConfiguration({
				schema: sf.array("Root", [sf.string, Note]),
			});
			const { provider, remote, base, branch, view } = createUpgradableViews(config);
			const runtime = provider.trees[1].containerRuntime;
			const submitted: string[][] = [];
			const off = base.mainBranch.events.on("beforeChange", (event) => {
				if (event.type === "append") {
					submitted.push(
						...event.newCommits.map((commit) =>
							commit.change.changes.map((inner) => inner.type),
						),
					);
				}
			});
			try {
				runtime.connected = false;
				view.upgradeSchema();
				const note = new Note({ text: "offline edit" });
				view.root.insertAtEnd(note);
				for (let index = 0; index < 10; index++) {
					remote.root.insertAtStart(`remote ${index}`);
					provider.synchronizeMessages();
				}
				assert.deepEqual(submitted, [["schema"], ["data"]]);
				runtime.connected = true;
				provider.synchronizeMessages();
				provider.synchronizeMessages();
				assert.equal(view.root[11] === note, true);
				assert.equal(note.text, "offline edit");
				assert.deepEqual(submitted, [["schema"], ["data"], ["schema"], ["data"]]);
				assert.deepEqual(
					base.exportVerbose(),
					provider.trees[0].kernel.checkout.exportVerbose(),
				);
			} finally {
				off();
				branch.dispose();
				remote.dispose();
			}
		});

		it("waits for an open transaction and excludes its aborted edits from recovery", async () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(configV2);
			let submitted = 0;
			const off = base.mainBranch.events.on("beforeChange", (event) => {
				if (event.type === "append") {
					submitted += event.newCommits.length;
				}
			});
			try {
				view.upgradeSchema();
				remote.root.insertAtStart("remote");
				view.root.insertAtEnd(1);
				const result = await view.runTransactionAsync(async () => {
					view.root.insertAtEnd(2);
					provider.synchronizeMessages();
					await Promise.resolve();
					assert.equal(submitted, 2, "Recovery ran inside an unfinished transaction.");
					return { rollback: true };
				});
				assert.equal(result.success, false);
				provider.synchronizeMessages();
				assert.equal(submitted, 4);
				assert.deepEqual([...view.root], ["remote", "initial", 1]);
			} finally {
				off();
				branch.dispose();
				remote.dispose();
			}
		});

		it("characterizes physical retry revisions in retained branch history", () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(configV2);
			// Keep the rejected commits in the native history instead of letting trimming hide them.
			const retained = base.mainBranch.fork();
			try {
				view.upgradeSchema();
				remote.root.insertAtStart("remote");
				view.runTransaction(
					() => {
						view.root.insertAtEnd(1);
					},
					{ customMetadata: { edit: "first" } },
				);
				const original = branch.checkout.branchHistory.getHead();
				assert(original !== undefined);
				provider.synchronizeMessages();
				provider.synchronizeMessages();

				const matchingRevisions: string[] = [];
				for (
					let commit = branch.checkout.branchHistory.getHead();
					commit !== undefined;
					commit = commit.getParent()
				) {
					if (commit.custom?.edit === "first") {
						matchingRevisions.push(commit.revision);
					}
				}
				assert.equal(matchingRevisions.length, 2);
				assert.equal(matchingRevisions[1], original.revision);
				assert.notEqual(matchingRevisions[0], original.revision);
				assert.throws(
					() => branch.checkout.revertTo(original.revision),
					/schema changed at intermediate commit/,
				);
				assert.deepEqual([...view.root], ["remote", "initial", 1]);
			} finally {
				retained.dispose();
				branch.dispose();
				remote.dispose();
			}
		});

		it("preserves logical notifications, labels, metadata, and serialized changes through retry", () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(configV2);
			const outcomes: CommitOutcome[] = [];
			const changes: JsonCompatibleReadOnly[] = [];
			const labels: unknown[][] = [];
			let undo: RevertibleAlpha | undefined;
			const off = view.events.on("changed", (metadata) => {
				if (
					metadata.isLocal &&
					metadata.kind === CommitKind.Default &&
					metadata.label === "first"
				) {
					changes.push(metadata.getChange());
					labels.push([...metadata.labels]);
					undo = metadata.getRevertible();
					metadata.events.on("settled", (outcome) => outcomes.push(outcome));
				}
			});
			view.upgradeSchema();
			const replay = view.fork();
			try {
				remote.root.insertAtStart("remote");
				view.runTransaction(
					() => {
						view.root.insertAtEnd(1);
					},
					{ label: "first", customMetadata: { edit: "first" } },
				);
				provider.synchronizeMessages();
				provider.synchronizeMessages();

				assert.equal(changes.length, 1, "Recovery emitted another local application change.");
				assert.deepEqual(labels, [["first"]]);
				assert.deepEqual(outcomes, [CommitOutcome.FullyApplied]);
				assert.deepEqual(branch.checkout.branchHistory.getHead()?.custom, { edit: "first" });
				// Serialization still describes the original edit in its authoring context,
				// just as it does after ordinary rebase. Replay must not repeat its callback.
				replay.applyChange(changes[0]);
				assert.deepEqual([...replay.root], ["initial", 1]);
				assert.deepEqual([...view.root], ["remote", "initial", 1]);
				assert(undo !== undefined);
				undo.revert();
				provider.synchronizeMessages();
				assert.deepEqual([...view.root], ["remote", "initial"]);
				expectSchemaEqual(base.storedSchema, toUpgradeSchema(configV2.schema));
			} finally {
				off();
				if (undo?.status === RevertibleStatus.Valid) {
					undo.dispose();
				}
				replay.dispose();
				branch.dispose();
				remote.dispose();
			}
		});

		it("uses accepted physical revisions for revertTo and application-fork rewindTo", () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(configV2);
			try {
				view.upgradeSchema();
				remote.root.insertAtStart("remote");
				view.root.insertAtEnd(1);
				provider.synchronizeMessages();
				provider.synchronizeMessages();
				const accepted = branch.checkout.branchHistory.getHead();
				assert(accepted !== undefined);
				view.root.insertAtEnd(2);
				provider.synchronizeMessages();
				const fork = view.fork();
				try {
					fork.rewindTo(accepted.revision);
					assert.deepEqual([...fork.root], ["remote", "initial", 1]);
					assert.deepEqual([...view.root], ["remote", "initial", 1, 2]);
					assert.equal(provider.peekNextMessage(), undefined);
				} finally {
					fork.dispose();
				}
				view.revertTo(accepted.revision);
				provider.synchronizeMessages();
				assert.deepEqual([...view.root], ["remote", "initial", 1]);
				expectSchemaEqual(base.storedSchema, toUpgradeSchema(configV2.schema));
			} finally {
				branch.dispose();
				remote.dispose();
			}
		});

		it("keeps independent bases synchronized without waiting for nonexistent acknowledgements", () => {
			const base = createTreeCheckout(testIdCompressor, mintRevisionTag, testRevisionTagCodec);
			const original = base.viewWith(configV1);
			original.initialize(["initial"]);
			original.dispose();
			const branch = new ViewBranch(base);
			const view = branch.viewWith(configV2);
			const outcomes: CommitOutcome[] = [];
			const off = view.events.on("changed", (metadata) => {
				if (metadata.isLocal) {
					metadata.events.on("settled", (outcome) => outcomes.push(outcome));
				}
			});
			try {
				view.upgradeSchema();
				view.root.insertAtEnd(1);
				const other = base.fork().viewWith(configV2);
				other.root.insertAtEnd(2);
				base.merge(other);
				assert.deepEqual([...view.root], ["initial", 1, 2]);
				assert.deepEqual(outcomes, [], "An independent edit was reported as sequenced.");
			} finally {
				off();
				branch.dispose();
				base.dispose();
			}
		});

		it("settles the original upgrade notification after private schema refreshes", () => {
			const { provider, remote, branch, view } = createUpgradableViews(configV2);
			const outcomes: CommitOutcome[] = [];
			let localChanges = 0;
			const off = view.events.on("changed", (metadata) => {
				if (metadata.isLocal) {
					localChanges++;
					metadata.events.on("settled", (outcome) => outcomes.push(outcome));
				}
			});
			try {
				view.upgradeSchema();
				remote.root.insertAtEnd("first");
				provider.synchronizeMessages();
				remote.root.insertAtEnd("second");
				provider.synchronizeMessages();
				view.root.insertAtEnd(1);
				provider.synchronizeMessages();
				assert.equal(
					localChanges,
					2,
					"Private preparation emitted extra application changes.",
				);
				assert.deepEqual(outcomes, [CommitOutcome.FullyApplied, CommitOutcome.FullyApplied]);
			} finally {
				off();
				branch.dispose();
				remote.dispose();
			}
		});

		it("cancels queued application edits without retrying and retains the local upgrade", () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(
				configV2,
				new TestTreeProviderLite(
					2,
					new SharedTreeTestFactory(() => {}),
					true,
					FlushMode.TurnBased,
				),
			);
			const runtime = provider.trees[1].containerRuntime;
			const outcomes: CommitOutcome[] = [];
			const revertibles: Revertible[] = [];
			const off = view.events.on("changed", (metadata) => {
				if (metadata.isLocal) {
					metadata.events.on("settled", (outcome) => outcomes.push(outcome));
					const revertible = metadata.getRevertible();
					if (revertible !== undefined) {
						revertibles.push(revertible);
					}
				}
			});
			try {
				view.upgradeSchema();
				view.root.insertAtEnd(1);
				assert(runtime instanceof MockContainerRuntime);
				assert(runtime.rollback !== undefined);
				runtime.rollback();
				assert.deepEqual([...view.root], ["initial"]);
				assert.equal(view.compatibility.canView, true);
				assert.equal(revertibles[0]?.status, RevertibleStatus.Disposed);
				expectSchemaEqual(base.storedSchema, toUpgradeSchema(configV1.schema));
				provider.synchronizeMessages();
				assert.equal(provider.peekNextMessage(), undefined);
				assert.deepEqual(outcomes, []);

				view.root.insertAtEnd(2);
				provider.synchronizeMessages();
				assert.deepEqual([...view.root], ["initial", 2]);
				assert.deepEqual(outcomes, [CommitOutcome.FullyApplied, CommitOutcome.FullyApplied]);
				expectSchemaEqual(base.storedSchema, toUpgradeSchema(configV2.schema));
			} finally {
				off();
				for (const revertible of revertibles) {
					if (revertible.status === RevertibleStatus.Valid) {
						revertible.dispose();
					}
				}
				branch.dispose();
				remote.dispose();
			}
		});

		for (const refreshBeforeMerge of [false, true]) {
			it(`publishes an application fork ${refreshBeforeMerge ? "after a schema-only refresh" : "without publishing the fork's edits early"}`, () => {
				const { provider, remote, base, branch, view } = createUpgradableViews(configV2);
				view.upgradeSchema();
				const fork = view.fork();
				try {
					fork.root.insertAtEnd(1);
					assert.deepEqual([...view.root], ["initial"]);
					assert.equal(provider.peekNextMessage(), undefined);
					if (refreshBeforeMerge) {
						remote.root.insertAtStart("remote");
						provider.synchronizeMessages();
					}
					view.merge(fork, false);
					provider.synchronizeMessages();
					provider.synchronizeMessages();
					assert.deepEqual(
						[...view.root],
						refreshBeforeMerge ? ["remote", "initial", 1] : ["initial", 1],
					);
					assert.deepEqual(
						base.exportVerbose(),
						provider.trees[0].kernel.checkout.exportVerbose(),
					);
				} finally {
					fork.dispose();
					branch.dispose();
					remote.dispose();
				}
			});
		}

		it("rebases an application fork across private preparation without replacing its objects", () => {
			class Note extends sf.object("RebasedForkNote", { text: sf.string }) {}
			const config = new TreeViewConfiguration({
				schema: sf.array("Root", [sf.string, Note]),
			});
			const { provider, remote, branch, view } = createUpgradableViews(config);
			view.upgradeSchema();
			const fork = view.fork();
			let undo: Revertible | undefined;
			const off = fork.events.on("changed", (metadata) => {
				if (metadata.isLocal && metadata.kind === CommitKind.Default) {
					undo = metadata.getRevertible();
				}
			});
			try {
				const note = new Note({ text: "fork edit" });
				fork.root.insertAtEnd(note);
				assert(undo !== undefined);
				remote.root.insertAtStart("remote");
				provider.synchronizeMessages();
				fork.rebaseOnto(view);
				assert.equal(fork.root[2] === note, true);
				assert.deepEqual([...view.root], ["remote", "initial"]);
				undo.revert();
				assert.deepEqual([...fork.root], ["remote", "initial"]);
				assert.equal(provider.peekNextMessage(), undefined);
			} finally {
				off();
				if (undo?.status === RevertibleStatus.Valid) {
					undo.dispose();
				}
				fork.dispose();
				branch.dispose();
				remote.dispose();
			}
		});

		it("reconciles a pre-retry fork without duplicating recovered work", () => {
			class Note extends sf.object("PreRetryForkNote", { text: sf.string }) {}
			const config = new TreeViewConfiguration({
				schema: sf.array("Root", [sf.string, Note]),
			});
			const { provider, remote, branch, view } = createUpgradableViews(config);
			view.upgradeSchema();
			remote.root.insertAtStart("remote");
			const parentNote = new Note({ text: "parent edit" });
			view.root.insertAtEnd(parentNote);
			const fork = view.fork();
			const forkNote = fork.root[1];
			assert(forkNote instanceof Note);
			let undo: Revertible | undefined;
			const off = fork.events.on("changed", (metadata) => {
				if (metadata.isLocal && metadata.kind === CommitKind.Default) {
					undo = metadata.getRevertible();
				}
			});
			try {
				forkNote.text = "fork edit";
				provider.synchronizeMessages();
				provider.synchronizeMessages();
				view.merge(fork, false);
				provider.synchronizeMessages();
				assert.equal(view.root.length, 3, "Merge duplicated the recovered insertion.");
				assert.equal(view.root[2] === parentNote, true);
				assert.equal(parentNote.text, "fork edit");
				view.merge(fork, false);
				assert.equal(
					provider.peekNextMessage(),
					undefined,
					"An unchanged fork was republished.",
				);

				fork.rebaseOnto(view);
				assert.equal(fork.root[2] === forkNote, true);
				assert(undo !== undefined);
				undo.revert();
				assert.equal(forkNote.text, "parent edit");
				assert.equal(parentNote.text, "fork edit", "The fork's undo escaped its checkout.");
			} finally {
				off();
				if (undo?.status === RevertibleStatus.Valid) {
					undo.dispose();
				}
				fork.dispose();
				branch.dispose();
				remote.dispose();
			}
		});

		it("keeps retry mappings usable after an application fork's ordinary data rebase", () => {
			const { provider, remote, branch, view } = createUpgradableViews(configV2);
			view.upgradeSchema();
			const sibling = view.fork();
			remote.root.insertAtStart("remote");
			view.root.insertAtEnd(1);
			const fork = view.fork();
			try {
				sibling.root.insertAtEnd("sibling");
				// Ordinary rebase replaces commit objects, but preserves their revision IDs.
				fork.rebaseOnto(sibling);
				provider.synchronizeMessages();
				provider.synchronizeMessages();
				view.merge(fork, false);
				provider.synchronizeMessages();
				assert.equal([...view.root].filter((value) => value === 1).length, 1);
				assert.equal([...view.root].filter((value) => value === "sibling").length, 1);
			} finally {
				fork.dispose();
				sibling.dispose();
				branch.dispose();
				remote.dispose();
			}
		});

		it("preserves shared-branch history restrictions on the private authoring checkout", () => {
			const { remote, branch, view } = createUpgradableViews(configV2);
			view.upgradeSchema();
			const fork = view.fork();
			try {
				const head = branch.checkout.branchHistory.getHead();
				assert(head !== undefined);
				assert.throws(
					() => branch.checkout.rewindTo(head.revision),
					/Cannot switch a view away from a shared branch/,
				);
				assert.throws(() => branch.checkout.rebaseOnto(fork), /0xa5d/);
				fork.merge(view);
				assert.equal(
					view.disposed,
					false,
					"Merging a shared source disposed its authoring view.",
				);
				assert.deepEqual([...view.root], ["initial"]);
			} finally {
				fork.dispose();
				branch.dispose();
				remote.dispose();
			}
		});

		it("retains fork work when schema reconciliation is unsafe", () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(configV2);
			view.upgradeSchema();
			const fork = branch.checkout.fork().viewWith(configV3);
			fork.upgradeSchema();
			fork.root.insertAtEnd(true);
			remote.root.insertAtStart("remote");
			provider.synchronizeMessages();
			assert.throws(() => view.merge(fork, false), /reconciliation is unsafe: schemaConflict/);
			assert.deepEqual(
				[...fork.root],
				["initial", true],
				"The unsafe merge discarded its source work.",
			);
			assert.throws(() => base.breaker.use(), /invalid state/);
			remote.dispose();
		});

		it("disposes the authoring view when its borrowed base is disposed", () => {
			const { remote, base, branch, view } = createUpgradableViews(configV2);
			base.dispose();
			assert.equal(branch.checkout.disposed, true);
			assert.equal(view.disposed, true);
			branch.dispose();
			remote.dispose();
		});

		it("supports deferred upgrades and synchronous outcomes on detached trees", () => {
			const runtime = new MockFluidDataStoreRuntime({ attachState: AttachState.Detached });
			const tree = new SharedTreeTestFactory(() => {}).create(runtime, "detached");
			new MockContainerRuntimeFactory().createContainerRuntime(runtime);
			const oldView = tree.kernel.viewWith(configV1);
			oldView.initialize(["initial"]);
			oldView.dispose();
			const base = tree.kernel.checkout;
			const branch = new ViewBranch(base);
			const view = branch.viewWith(configV2);
			const outcomes: CommitOutcome[] = [];
			const off = view.events.on("changed", (metadata) => {
				if (metadata.isLocal) {
					metadata.events.on("settled", (outcome) => outcomes.push(outcome));
				}
			});
			try {
				view.upgradeSchema();
				expectSchemaEqual(base.storedSchema, toUpgradeSchema(configV1.schema));
				view.root.insertAtEnd(1);
				view.root.insertAtEnd(2);
				assert.deepEqual([...view.root], ["initial", 1, 2]);
				assert.deepEqual(outcomes, [
					CommitOutcome.FullyApplied,
					CommitOutcome.FullyApplied,
					CommitOutcome.FullyApplied,
				]);
			} finally {
				off();
				branch.dispose();
			}
		});

		it("publishes to a named shared branch without changing the main branch", () => {
			const provider = new TestTreeProviderLite(
				2,
				configuredSharedTree({ enableSharedBranches: true }).getFactory(),
			);
			const main = provider.trees[0].kernel.viewWith(configV1);
			main.initialize(["initial"]);
			provider.synchronizeMessages();
			const id = provider.trees[0].createSharedBranch("deferred");
			provider.synchronizeMessages();
			const initial = provider.trees[1].kernel.viewBranchWith(id, configV1);
			assert(initial instanceof SchematizingSimpleTreeView);
			const base = initial.checkout;
			initial.dispose();
			assert.equal(
				base.disposed,
				false,
				"Disposing a named-branch view disposed its owned checkout.",
			);
			const branch = new ViewBranch(base);
			const view = branch.viewWith(configV2);
			const outcomes: CommitOutcome[] = [];
			const off = view.events.on("changed", (metadata) => {
				if (metadata.isLocal) {
					metadata.events.on("settled", (outcome) => outcomes.push(outcome));
				}
			});
			try {
				view.upgradeSchema();
				view.root.insertAtEnd(1);
				provider.synchronizeMessages();
				const peer = provider.trees[0].kernel.viewBranchWith(id, configV2);
				assert.deepEqual([...peer.root], ["initial", 1]);
				assert.deepEqual([...main.root], ["initial"]);
				assert.deepEqual(outcomes, [CommitOutcome.FullyApplied, CommitOutcome.FullyApplied]);
				peer.dispose();
			} finally {
				off();
				branch.dispose();
				main.dispose();
			}
		});

		it("summarizes only published named-branch state and reloads its upgraded schema", async () => {
			const provider = await TestTreeProvider.create(
				1,
				SummarizeType.onDemand,
				new SharedTreeTestFactory(
					() => {},
					undefined,
					resolveOptions({ enableSharedBranches: true }),
				),
			);
			const tree = provider.trees[0];
			const main = tree.kernel.viewWith(configV1);
			main.initialize(["initial"]);
			await provider.ensureSynchronized();
			const id = tree.createSharedBranch("summary");
			await provider.ensureSynchronized();
			const initial = tree.kernel.viewBranchWith(id, configV1);
			assert(initial instanceof SchematizingSimpleTreeView);
			const branch = new ViewBranch(initial.checkout);
			initial.dispose();
			const view = branch.viewWith(configV2);
			try {
				view.upgradeSchema();
				await provider.summarize();
				await provider.ensureSynchronized();
				const before = await provider.createTree();
				const beforeView = before.kernel.viewBranchWith(id, configV1);
				assert.deepEqual([...beforeView.root], ["initial"]);
				beforeView.dispose();

				view.root.insertAtEnd(1);
				await provider.ensureSynchronized();
				await provider.summarize();
				await provider.ensureSynchronized();
				const after = await provider.createTree();
				const afterView = after.kernel.viewBranchWith(id, configV2);
				assert.deepEqual([...afterView.root], ["initial", 1]);
				assert.deepEqual([...main.root], ["initial"]);
				afterView.dispose();
			} finally {
				branch.dispose();
				main.dispose();
			}
		});

		it("does not publish for an empty application transaction", () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(configV2);
			try {
				view.upgradeSchema();
				view.runTransaction(() => {});
				assert.equal(provider.peekNextMessage(), undefined);
				expectSchemaEqual(base.storedSchema, toUpgradeSchema(configV1.schema));
				assert.deepEqual([...view.root], ["initial"]);
			} finally {
				branch.dispose();
				remote.dispose();
			}
		});

		for (const trigger of ["constraint-only", "net-zero"] as const) {
			it(`publishes a ${trigger} application commit`, () => {
				const { provider, remote, base, branch, view } = createUpgradableViews(
					configV2,
					new TestTreeProviderLite(
						2,
						new SharedTreeTestFactory(() => {}, undefined, {
							minVersionForCollab: FluidClientVersion.v2_80,
						}),
					),
				);
				try {
					view.upgradeSchema();
					view.runTransaction(() => {
						if (trigger === "constraint-only") {
							branch.checkout.editor.addNoChangeConstraint();
						} else {
							view.root.insertAtEnd(1);
							view.root.removeAt(1);
						}
					});
					provider.synchronizeMessages();
					assert.deepEqual([...view.root], ["initial"]);
					expectSchemaEqual(base.storedSchema, toUpgradeSchema(configV2.schema));
				} finally {
					branch.dispose();
					remote.dispose();
				}
			});
		}

		it("initializes an empty tree immediately and preserves the supplied root object", () => {
			const provider = new TestTreeProviderLite(2);
			const branch = new ViewBranch(provider.trees[1].kernel.checkout);
			const view = branch.viewWith(configV2);
			try {
				const root = new configV2.schema(["initial", 1]);
				view.initialize(root);
				assert.equal(view.root === root, true);
				provider.synchronizeMessages();
				const peer = provider.trees[0].kernel.viewWith(configV2);
				assert.deepEqual([...peer.root], ["initial", 1]);
				assert.equal(view.root === root, true);
				peer.dispose();
			} finally {
				branch.dispose();
			}
		});

		it("publishes root replacement through the value-field editor", () => {
			const { provider, remote, base, branch, view } = createSchemaScenario(
				new TreeViewConfiguration({ schema: sf.string }),
				new TreeViewConfiguration({ schema: [sf.string, sf.number] }),
				"initial",
			);
			try {
				view.upgradeSchema();
				view.root = 1;
				provider.synchronizeMessages();
				assert.equal(view.root, 1);
				assert.equal(base.exportVerbose(), 1);
			} finally {
				branch.dispose();
				remote.dispose();
			}
		});

		it("publishes object-field edits using the upgraded schema", () => {
			const { provider, remote, base, branch, view } = createSchemaScenario(
				new TreeViewConfiguration({ schema: sf.object("ObjectRoot", { value: sf.string }) }),
				new TreeViewConfiguration({
					schema: sf.object("ObjectRoot", { value: [sf.string, sf.number] }),
				}),
				{ value: "initial" },
			);
			try {
				view.upgradeSchema();
				const root = view.root;
				root.value = 1;
				provider.synchronizeMessages();
				assert.equal(view.root === root, true);
				assert.equal(root.value, 1);
				assert.deepEqual(
					base.exportVerbose(),
					provider.trees[0].kernel.checkout.exportVerbose(),
				);
			} finally {
				branch.dispose();
				remote.dispose();
			}
		});

		it("publishes map entries using newly allowed types", () => {
			const { provider, remote, base, branch, view } = createSchemaScenario(
				new TreeViewConfiguration({ schema: sf.map("MapRoot", sf.string) }),
				new TreeViewConfiguration({ schema: sf.map("MapRoot", [sf.string, sf.number]) }),
				new Map([["initial", "value"]]),
			);
			try {
				view.upgradeSchema();
				view.root.set("added", 1);
				provider.synchronizeMessages();
				assert.equal(view.root.get("added"), 1);
				assert.deepEqual(
					base.exportVerbose(),
					provider.trees[0].kernel.checkout.exportVerbose(),
				);
			} finally {
				branch.dispose();
				remote.dispose();
			}
		});

		it("publishes record entries using newly allowed types", () => {
			const { provider, remote, base, branch, view } = createSchemaScenario(
				new TreeViewConfiguration({ schema: sf.record("RecordRoot", sf.string) }),
				new TreeViewConfiguration({ schema: sf.record("RecordRoot", [sf.string, sf.number]) }),
				{ initial: "value" },
			);
			try {
				view.upgradeSchema();
				view.root.added = 1;
				provider.synchronizeMessages();
				assert.equal(view.root.added, 1);
				assert.deepEqual(
					base.exportVerbose(),
					provider.trees[0].kernel.checkout.exportVerbose(),
				);
			} finally {
				branch.dispose();
				remote.dispose();
			}
		});

		it("publishes serialized application changes after the deferred schema", () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(configV2);
			view.upgradeSchema();
			const fork = view.fork();
			let change: JsonCompatibleReadOnly | undefined;
			const offChange = fork.events.on("changed", (metadata) => {
				if (metadata.isLocal) {
					change = metadata.getChange();
				}
			});
			const published: string[][] = [];
			const offBase = base.mainBranch.events.on("beforeChange", (event) => {
				if (event.type === "append") {
					published.push(
						...event.newCommits.map((commit) =>
							commit.change.changes.map((inner) => inner.type),
						),
					);
				}
			});
			try {
				fork.root.insertAtEnd(1);
				assert(change !== undefined);
				assert.equal(provider.peekNextMessage(), undefined);
				view.applyChange(change);
				provider.synchronizeMessages();
				assert.deepEqual(published, [["schema"], ["data"]]);
				assert.deepEqual([...view.root], ["initial", 1]);
			} finally {
				offChange();
				offBase();
				fork.dispose();
				branch.dispose();
				remote.dispose();
			}
		});

		it("recovers a move while preserving the moved node's identity", () => {
			class Note extends sf.object("MovedNote", { text: sf.string }) {}
			const { provider, remote, branch, view } = createSchemaScenario(
				new TreeViewConfiguration({ schema: sf.array("MoveRoot", Note) }),
				new TreeViewConfiguration({ schema: sf.array("MoveRoot", [Note, sf.number]) }),
				[{ text: "a" }, { text: "b" }],
			);
			try {
				view.upgradeSchema();
				const moved = view.root[0];
				assert(moved instanceof Note);
				remote.root.insertAtStart(new Note({ text: "remote" }));
				view.root.moveToEnd(0);
				provider.synchronizeMessages();
				provider.synchronizeMessages();
				assert.equal(view.root[2] === moved, true);
				assert.equal(moved.text, "a");
				assert.deepEqual(
					[...view.root].map((node) => (node instanceof Note ? node.text : node)),
					["remote", "b", "a"],
				);
			} finally {
				branch.dispose();
				remote.dispose();
			}
		});

		it("publishes nested transactions with the standard minimization post-processor", () => {
			const { provider, remote, base, branch, view } = createUpgradableViews(
				configV2,
				new TestTreeProviderLite(
					2,
					new SharedTreeTestFactory(() => {}, undefined, {
						minVersionForCollab: FluidClientVersion.v2_80,
					}),
				),
			);
			try {
				view.upgradeSchema();
				view.runTransaction(
					() => {
						view.runTransaction(() => view.root.insertAtEnd(1));
						view.root.insertAtEnd(2);
						view.root.removeAt(2);
					},
					{ postProcessor: minimize },
				);
				provider.synchronizeMessages();
				assert.deepEqual([...view.root], ["initial", 1]);
				expectSchemaEqual(base.storedSchema, toUpgradeSchema(configV2.schema));
			} finally {
				branch.dispose();
				remote.dispose();
			}
		});

		it("merges a fork that requested its upgrade before the parent did", () => {
			const { provider, remote, branch, view } = createUpgradableViews(configV2);
			const fork = view.fork();
			try {
				fork.upgradeSchema();
				fork.root.insertAtEnd(1);
				view.upgradeSchema();
				remote.root.insertAtStart("remote");
				provider.synchronizeMessages();
				view.merge(fork, false);
				provider.synchronizeMessages();
				assert.deepEqual([...view.root], ["remote", "initial", 1]);
			} finally {
				fork.dispose();
				branch.dispose();
				remote.dispose();
			}
		});

		it("keeps a requested staged upgrade enabled while receiving data-only changes", () => {
			const stagedNumber = SchemaFactoryAlpha.staged(sf.number);
			const upgrade = stagedNumber.metadata.stagedSchemaUpgrade;
			assert(upgrade !== undefined);
			const { provider, remote, branch, view } = createSchemaScenario(
				new TreeViewConfiguration({ schema: sf.optional(sf.string) }),
				new TreeViewConfigurationAlpha({
					schema: sf.optional(sf.types([sf.string, stagedNumber])),
					stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(upgrade),
				}),
				"initial",
			);
			try {
				assert.equal(view.compatibility.canView, true);
				view.upgradeSchema();
				assert.equal(view.isStagedUpgradeEnabled(upgrade), "enabled");
				remote.root = "remote";
				provider.synchronizeMessages();
				assert.equal(view.root, "remote");
				assert.equal(view.isStagedUpgradeEnabled(upgrade), "enabled");
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
		it("waits for every member and retains failure after the schema was accepted", () => {
			const schema = initialPublication();
			const data = initialPublication();
			const acceptedSchema = settleViewPublication(
				schema,
				schema.revision,
				CommitOutcome.FullyApplied,
			);
			assert.equal(getPublicationStatus([acceptedSchema, data]), "pending");
			const rejectedData = settleViewPublication(
				data,
				data.revision,
				CommitOutcome.FullyDropped,
			);
			assert.equal(getPublicationStatus([acceptedSchema, rejectedData]), "retryRequired");
		});

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

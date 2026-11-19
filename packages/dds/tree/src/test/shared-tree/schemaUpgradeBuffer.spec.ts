/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { AttachState } from "@fluidframework/container-definitions";
import { SummaryType } from "@fluidframework/driver-definitions";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";
import {
	MockContainerRuntime,
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils/internal";
import {
	getRequiredPendingLocalState,
	type TestFluidObjectInternal,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";
import { asAlpha } from "../../api.js";
import { SharedTree as SharedTreeKind } from "../../treeFactory.js";
import {
	CommitKind,
	CommitOutcome,
	type Revertible,
	RevertibleStatus,
} from "../../core/index.js";
import { FluidClientVersion } from "../../codec/index.js";
import type { SchemaChange } from "../../feature-libraries/index.js";
import {
	SchemaFactory,
	SchemaFactoryBeta,
	TreeViewConfiguration,
	toUpgradeSchema,
} from "../../simple-tree/index.js";
import {
	expectSchemaEqual,
	DefaultTestSharedTreeKind,
	SharedTreeTestFactory,
	TestTreeProviderLite,
	TestTreeProvider,
	SummarizeType,
} from "../utils.js";

describe("Schema upgrade submission buffer", () => {
	const sf = new SchemaFactory("schemaBuffer");
	class Note extends sf.object("Note", { text: sf.string }) {}
	// Keep the root type identifier unchanged. The newer schema adds an allowed
	// element type, so existing content is valid but the stored schema needs an upgrade.
	const before = new TreeViewConfiguration({ schema: sf.array("Root", sf.string) });
	const after = new TreeViewConfiguration({ schema: sf.array("Root", [sf.string, Note]) });

	function validateBufferedSummaryAssertion(error: Error): boolean {
		return validateAssertionError(
			"Cannot summarize while local commits are buffered for submission.",
		)(error);
	}

	/**
	 * Creates attached peers with the old schema already sequenced and a view of the newer schema.
	 * The returned view has not requested an upgrade. Each test controls that request and its first edit.
	 */
	function setup(flushMode = FlushMode.Immediate) {
		const provider = new TestTreeProviderLite(
			2,
			new SharedTreeTestFactory(() => {}, undefined, {
				bufferSchemaUpgrades: true,
			}),
			true,
			flushMode,
		);
		const remote = provider.trees[0].kernel.viewWith(before);
		remote.initialize(["initial"]);
		// Finish initialization before measuring whether an upgrade submits any new ops.
		provider.synchronizeMessages();
		const tree = provider.trees[1];
		const view = tree.kernel.viewWith(after);
		return { provider, tree, remote, view };
	}

	/**
	 * Creates a detached tree with schema-upgrade buffering enabled and initial content under the old schema.
	 *
	 * @remarks
	 * The tree is not connected or bound to its runtime, so it stays detached even if the runtime is attached.
	 * This lets tests check that buffering depends on the tree's attachment state, not just the runtime's state.
	 * The initial view is disposed before creating a view with the newer schema.
	 * No upgrade is requested here; each test controls when to call `upgradeSchema()`.
	 *
	 * @param attachState - Attachment state of the mock data store runtime, not of the tree.
	 * @returns The mock runtimes, tree factory, initialized tree, and view with the newer schema.
	 */
	function setupDetached(attachState = AttachState.Detached) {
		const runtime = new MockFluidDataStoreRuntime({ attachState });
		const runtimeFactory = new MockContainerRuntimeFactory();
		runtimeFactory.createContainerRuntime(runtime);
		const factory = new SharedTreeTestFactory(() => {}, undefined, {
			bufferSchemaUpgrades: true,
		});
		const tree = factory.create(runtime, "detached");
		assert.equal(tree.isAttached(), false);
		const initial = tree.kernel.viewWith(before);
		initial.initialize(["initial"]);
		initial.dispose();
		const view = tree.kernel.viewWith(after);
		return { runtime, runtimeFactory, factory, tree, view };
	}

	it("keeps an upgrade local until the first application commit and preserves native undo", () => {
		const { provider, tree, remote, view } = setup();
		let undo: Revertible | undefined;
		const off = view.events.on("changed", (metadata) => {
			if (metadata.isLocal && metadata.kind === CommitKind.Default) {
				// The schema commit has no revertible. Retain the first data revertible
				// so the test checks native undo rather than creating a separate undo edit.
				undo ??= metadata.getRevertible();
			}
		});
		try {
			const trunk = tree.kernel.getTrunkHead();
			view.upgradeSchema();
			const schemaRevision = view.checkout.mainBranch.getHead().revision;
			// The upgraded view is local; neither sequenced history nor the outgoing queue advances.
			assert.equal(tree.kernel.getTrunkHead(), trunk);
			assert.equal(provider.peekNextMessage(), undefined);
			const root = view.root;
			const note = new Note({ text: "local" });
			root.insertAtEnd(note);
			const data = view.checkout.mainBranch.getHead();
			// Publication must keep separate, ordered schema and data commits and the same node objects.
			assert.equal(data.parent?.revision, schemaRevision);
			provider.synchronizeMessages();
			assert.equal(tree.kernel.getTrunkHead().revision, data.revision);
			assert.equal(view.root === root, true);
			assert.equal(root[1] === note, true);
			assert(undo !== undefined);
			// Undo removes the data edit, not the schema that was published with it.
			undo.revert();
			provider.synchronizeMessages();
			assert.deepEqual([...view.root], ["initial"]);
			expectSchemaEqual(tree.kernel.storedSchema, toUpgradeSchema(after.schema));
		} finally {
			off();
			if (undo?.status === RevertibleStatus.Valid) undo.dispose();
			view.dispose();
			remote.dispose();
		}
	});

	it("does not flush on empty or upgrade-only transactions, or on application abort", () => {
		const { provider, remote, view } = setup();
		try {
			// The upgrade commits, but neither an empty transaction nor rolled-back
			// data supplies the committed application change needed to release it.
			view.runTransaction(() => view.upgradeSchema());
			view.runTransaction(() => {});
			view.runTransaction(() => {
				view.root.insertAtEnd(new Note({ text: "cancelled" }));
				return { rollback: true };
			});
			assert.equal(provider.peekNextMessage(), undefined);
			assert.deepEqual([...view.root], ["initial"]);
			// The earlier upgrade must still be available for the next committed edit.
			view.root.insertAtEnd(new Note({ text: "committed" }));
			provider.synchronizeMessages();
			assert.equal(view.root.length, 2);
		} finally {
			view.dispose();
			remote.dispose();
		}
	});

	it("preserves the default immediate-upgrade behavior", () => {
		// Do not use the buffering factory: callers that omit the option must keep
		// publishing upgrades without waiting for a data edit.
		const provider = new TestTreeProviderLite(2);
		const remote = provider.trees[0].kernel.viewWith(before);
		remote.initialize(["initial"]);
		provider.synchronizeMessages();
		const view = provider.trees[1].kernel.viewWith(after);
		try {
			view.upgradeSchema();
			assert.notEqual(provider.peekNextMessage(), undefined);
			provider.synchronizeMessages();
			expectSchemaEqual(provider.trees[0].kernel.storedSchema, toUpgradeSchema(after.schema));
		} finally {
			view.dispose();
			remote.dispose();
		}
	});

	it("does not buffer schema requests from an aborted transaction", () => {
		const { provider, tree, remote, view } = setup();
		try {
			// Unlike an upgrade committed before an aborted edit, this upgrade belongs
			// to the aborted transaction and must leave no local schema or queued revision.
			view.runTransaction(() => {
				view.upgradeSchema();
				return { rollback: true };
			});
			assert.equal(view.compatibility.canView, false);
			assert.equal(provider.peekNextMessage(), undefined);
			assert.equal(tree.kernel.getLocalBranch().getHead(), tree.kernel.getTrunkHead());
			// This synchronous summary also checks that cancellation left the buffer empty.
			assert.doesNotThrow(() => tree.getAttachSummary());
		} finally {
			view.dispose();
			remote.dispose();
		}
	});

	it("flushes schema-only initialization even without initial content", () => {
		const provider = new TestTreeProviderLite(
			2,
			new SharedTreeTestFactory(() => {}, undefined, {
				bufferSchemaUpgrades: true,
			}),
		);
		// An optional root can initialize without data. The schema-only initialization
		// must still publish on an attached tree; this is not the detached bypass.
		const config = new TreeViewConfiguration({ schema: sf.optional(sf.string) });
		const view = provider.trees[0].kernel.viewWith(config);
		try {
			view.initialize(undefined);
			provider.synchronizeMessages();
			expectSchemaEqual(provider.trees[1].kernel.storedSchema, toUpgradeSchema(config.schema));
			assert.equal(view.root, undefined);
			assert.equal(
				provider.trees[0].kernel.getLocalBranch().getHead(),
				provider.trees[0].kernel.getTrunkHead(),
			);
		} finally {
			view.dispose();
		}
	});

	it("waits for validation of the triggering data before submitting any buffered schema", () => {
		const { provider, remote, view } = setup();
		view.upgradeSchema();
		const checkout = view.checkout;
		const onCommitValid = checkout.onCommitValid;
		const callbacks: (() => void)[] = [];
		// Delay the validation callback without replacing the real validation logic.
		// Appending a data trigger alone must not release the schema.
		checkout.onCommitValid = (commit, callback) => {
			callbacks.push(() => onCommitValid.call(checkout, commit, callback));
			return false;
		};
		try {
			view.root.insertAtEnd(new Note({ text: "waiting for validation" }));
			assert.equal(provider.peekNextMessage(), undefined);
			assert.equal(callbacks.length, 1);
			callbacks[0]();
			provider.synchronizeMessages();
			expectSchemaEqual(provider.trees[0].kernel.storedSchema, toUpgradeSchema(after.schema));
		} finally {
			checkout.onCommitValid = onCommitValid;
			view.dispose();
			remote.dispose();
		}
	});

	it("flushes only through the last triggering commit in merged history", () => {
		const { provider, tree, remote, view } = setup();
		view.upgradeSchema();
		const fork = view.fork();
		const expanded = sf.array("Root", [sf.string, Note, sf.boolean]);
		fork.root.insertAtEnd(new Note({ text: "first data" }));
		const dataRevision = fork.checkout.mainBranch.getHead().revision;
		// The merged history ends with another schema-only commit after the data trigger.
		// That trailing schema must remain private even though the entire append is validated.
		fork.checkout.updateSchema(toUpgradeSchema(expanded));
		const laterRevision = fork.checkout.mainBranch.getHead().revision;
		view.merge(fork, false);
		provider.synchronizeMessages();
		assert.equal(tree.kernel.getTrunkHead().revision, dataRevision);
		expectSchemaEqual(provider.trees[0].kernel.storedSchema, toUpgradeSchema(after.schema));
		assert.equal(tree.kernel.getLocalBranch().getHead().revision, laterRevision);
		assert.equal(provider.peekNextMessage(), undefined);
		view.dispose();
		fork.dispose();
		// The trailing schema is already local. Replace the view to edit through that
		// schema and supply a distinct trigger for the still-buffered suffix.
		const later = tree.kernel.viewWith(new TreeViewConfiguration({ schema: expanded }));
		try {
			later.root.insertAtEnd(true);
			provider.synchronizeMessages();
			expectSchemaEqual(provider.trees[0].kernel.storedSchema, toUpgradeSchema(expanded));
		} finally {
			later.dispose();
			remote.dispose();
		}
	});

	it("fails explicitly if transport submission throws partway through a flush", () => {
		const { tree, remote, view } = setup();
		view.upgradeSchema();
		const kernel = tree.kernel;
		const descriptor = Object.getOwnPropertyDescriptor(kernel, "submitLocalMessage");
		const submit = kernel.submitLocalMessage;
		const failure = new Error("injected second submission failure");
		let submitted = 0;
		// Let the schema reach the runtime, then fail data submission. This checks
		// partial publication, where pretending that neither commit was sent is unsafe.
		Object.defineProperty(kernel, "submitLocalMessage", {
			configurable: true,
			value: (content: unknown, metadata?: unknown): void => {
				if (++submitted === 2) throw failure;
				submit(content, metadata);
			},
		});
		try {
			assert.throws(
				() => view.root.insertAtEnd(new Note({ text: "fails" })),
				(error) => error === failure,
			);
			assert.equal(submitted, 2);
			assert.throws(() => view.checkout.breaker.use(), /invalid state/);
		} finally {
			assert(descriptor !== undefined);
			Object.defineProperty(kernel, "submitLocalMessage", descriptor);
			// Do not clear or dispose the broken local checkout to make the test continue.
			remote.dispose();
		}
	});

	// TODO: Replace this limitation check when the remote rebase acceptance cases pass.
	// Dropping the buffered schema is current prototype behavior, not the intended contract.
	it("sends current rebased changes without reconstructing a dropped buffered schema", () => {
		const { provider, tree, remote, view } = setup();
		const outcomes: CommitOutcome[] = [];
		const off = view.events.on("changed", (metadata) => {
			if (metadata.isLocal) metadata.events.on("settled", (outcome) => outcomes.push(outcome));
		});
		view.upgradeSchema();
		const revision = view.checkout.mainBranch.getHead().revision;
		// This prototype deliberately keeps the native schema-rebase limitation:
		// rebasing this upgrade over remote data drops its schema change.
		remote.root.insertAtStart("remote");
		provider.synchronizeMessages();
		assert.equal(
			view.compatibility.canView,
			false,
			"The prototype unexpectedly repaired schema rebase.",
		);
		assert.equal(provider.peekNextMessage(), undefined);
		// Rebase retains the logical revision but replaces its contents with an empty change.
		assert.equal(view.checkout.mainBranch.getHead().revision, revision);
		assert.deepEqual(view.checkout.mainBranch.getHead().change.changes, []);
		view.dispose();
		// Use a compatible view for the next edit. Flushing must use current history,
		// not restore the original schema or retry the dropped upgrade.
		const readable = tree.kernel.viewWith(before);
		try {
			readable.root.insertAtEnd("next application change");
			provider.synchronizeMessages();
			assert.deepEqual([...remote.root], ["remote", "initial", "next application change"]);
			assert.deepEqual(outcomes, [CommitOutcome.FullyDropped]);
			expectSchemaEqual(tree.kernel.storedSchema, toUpgradeSchema(before.schema));
		} finally {
			off();
			readable.dispose();
			remote.dispose();
		}
	});

	it("keeps an equivalent remote upgrade without sending a stale local schema", () => {
		const { provider, tree, remote, view } = setup();
		view.upgradeSchema();
		remote.dispose();
		// The other client upgrades and edits first, so its schema reaches the trunk first.
		provider.trees[0].kernel.checkout.updateSchema(toUpgradeSchema(after.schema));
		// A data change is required because this test's factory buffers schema on both clients.
		const peer = provider.trees[0].kernel.viewWith(after);
		peer.root.insertAtEnd("peer");
		provider.synchronizeMessages();
		assert.equal(view.compatibility.canView, true);
		assert.equal(provider.peekNextMessage(), undefined);
		try {
			// The peer already published the needed schema. A later local edit must
			// converge without resending the original, now-stale schema change.
			view.root.insertAtEnd(new Note({ text: "local after remote upgrade" }));
			provider.synchronizeMessages();
			assert.equal(peer.root.length, 3);
			assert.deepEqual(
				tree.kernel.checkout.exportVerbose(),
				provider.trees[0].kernel.checkout.exportVerbose(),
			);
		} finally {
			view.dispose();
			peer.dispose();
		}
	});

	describe("remote rebase acceptance", () => {
		// These tests specify future behavior without schema-rebase workarounds.
		// Only cases that fail today are skipped. Enable them as rebase and view-lifetime support is added.
		/**
		 * Uses immediate schema submission on the remote peer to test incoming schema ops without a data trigger.
		 * Only the second tree buffers upgrades. Record its sequenced schema changes to detect stale publication.
		 */
		function createProvider() {
			const immediate = new SharedTreeTestFactory(() => {});
			const buffered = new SharedTreeTestFactory(() => {}, undefined, {
				bufferSchemaUpgrades: true,
			});
			const provider = new TestTreeProviderLite(2, {
				type: buffered.type,
				attributes: buffered.attributes,
				create: (runtime, id) => (id === "tree-0" ? immediate : buffered).create(runtime, id),
				load: buffered.load.bind(buffered),
			});
			const [remoteTree, tree] = provider.trees;
			const publishedSchemas: SchemaChange[] = [];
			const stopTracking = tree.kernel.checkout.mainBranch.events.on(
				"commitSequenced",
				({ change }) => {
					for (const part of change.changes) {
						if (part.type === "schema") publishedSchemas.push(part.innerChange);
					}
				},
			);
			return { provider, remoteTree, tree, publishedSchemas, stopTracking };
		}

		for (const edit of ["insert", "remove", "replace"] as const) {
			// TODO: Enable when schema-over-data rebase preserves the buffered upgrade.
			// Currently the local view becomes incompatible as soon as remote data arrives.
			it.skip(`preserves a buffered upgrade across a remote data ${edit}`, () => {
				const { provider, remoteTree, tree, publishedSchemas, stopTracking } =
					createProvider();
				const remote = remoteTree.kernel.viewWith(before);
				remote.initialize(["initial"]);
				provider.synchronizeMessages();
				const view = tree.kernel.viewWith(after);
				view.upgradeSchema();
				const root = view.root;
				const readability: boolean[] = [];
				const stopObserving = view.events.on("schemaChanged", () => {
					readability.push(view.compatibility.canView);
				});
				try {
					// Replace is one transaction so its remove and insert arrive as one data commit.
					remote.runTransaction(() => {
						if (edit !== "insert") remote.root.removeAt(0);
						if (edit !== "remove") remote.root.insertAtStart("remote");
					});
					provider.synchronizeMessages();
					const expected =
						edit === "insert" ? ["remote", "initial"] : edit === "remove" ? [] : ["remote"];

					// Rebase must preserve the local upgrade and usable node references without
					// temporarily reporting an incompatible schema to application listeners.
					assert.equal(
						view.compatibility.canView,
						true,
						"Remote data must not discard the buffered upgrade.",
					);
					assert.equal(readability.includes(false), false);
					assert.equal(view.root === root, true);
					assert.deepEqual([...root], expected);
					expectSchemaEqual(tree.kernel.storedSchema, toUpgradeSchema(after.schema));
					expectSchemaEqual(remoteTree.kernel.storedSchema, toUpgradeSchema(before.schema));
					assert.equal(provider.peekNextMessage(), undefined);
					assert.equal(publishedSchemas.length, 0);

					// Receiving data is not a publication trigger. This later local edit must
					// publish the retained upgrade before data that requires the newer schema.
					const note = new Note({ text: "local after remote data" });
					root.insertAtEnd(note);
					provider.synchronizeMessages();
					assert.equal(root[root.length - 1] === note, true);
					assert.equal(publishedSchemas.length, 1);
					expectSchemaEqual(publishedSchemas[0].schema.old, toUpgradeSchema(before.schema));
					expectSchemaEqual(publishedSchemas[0].schema.new, toUpgradeSchema(after.schema));
					assert.deepEqual(
						tree.kernel.checkout.exportVerbose(),
						remoteTree.kernel.checkout.exportVerbose(),
					);
				} finally {
					stopObserving();
					stopTracking();
					view.dispose();
					remote.dispose();
				}
			});
		}

		for (const withData of [false, true]) {
			// TODO: Enable when equivalent remote schema changes preserve existing node references.
			// Currently the view stays readable, but rebase replaces its root object.
			it.skip(`adopts an identical remote upgrade ${withData ? "with" : "without"} subsequent remote data`, () => {
				const { provider, remoteTree, tree, publishedSchemas, stopTracking } =
					createProvider();
				const initial = remoteTree.kernel.viewWith(before);
				initial.initialize(["initial"]);
				provider.synchronizeMessages();
				initial.dispose();
				const view = tree.kernel.viewWith(after);
				view.upgradeSchema();
				const root = view.root;
				const remote = remoteTree.kernel.viewWith(after);
				try {
					remote.upgradeSchema();
					if (withData) remote.root.insertAtEnd(new Note({ text: "remote" }));
					provider.synchronizeMessages();
					assert.equal(view.compatibility.canView, true);
					assert.equal(
						view.root === root,
						true,
						"An equivalent remote upgrade must preserve existing node references.",
					);
					assert.equal(root.length, withData ? 2 : 1);
					assert.equal(provider.peekNextMessage(), undefined);
					assert.equal(publishedSchemas.length, 0);

					// An abort must not restore a cancelled upgrade. Later edits must use the
					// received schema, without publishing the original local schema change.
					view.runTransaction(() => {
						root.insertAtEnd(new Note({ text: "aborted" }));
						return { rollback: true };
					});
					assert.equal(provider.peekNextMessage(), undefined);
					root.insertAtEnd(new Note({ text: "first local edit" }));
					provider.synchronizeMessages();
					root.insertAtEnd("second local edit");
					provider.synchronizeMessages();
					assert.equal(publishedSchemas.length, 0);
					expectSchemaEqual(remoteTree.kernel.storedSchema, toUpgradeSchema(after.schema));
					assert.deepEqual(
						tree.kernel.checkout.exportVerbose(),
						remoteTree.kernel.checkout.exportVerbose(),
					);
				} finally {
					stopTracking();
					view.dispose();
					remote.dispose();
				}
			});
		}

		// TODO: Enable when schema-over-schema rebase retains the remaining local expansion.
		// Currently the incoming partial upgrade replaces the local target and invalidates its view.
		it.skip("rebases a still-needed upgrade onto an insufficient remote schema", () => {
			const { provider, remoteTree, tree, publishedSchemas, stopTracking } = createProvider();
			const expanded = new TreeViewConfiguration({
				schema: sf.array("Root", [sf.string, Note, sf.boolean]),
			});
			const initial = remoteTree.kernel.viewWith(before);
			initial.initialize(["initial"]);
			provider.synchronizeMessages();
			initial.dispose();
			const view = tree.kernel.viewWith(expanded);
			view.upgradeSchema();
			const root = view.root;
			const remote = remoteTree.kernel.viewWith(after);
			try {
				// The remote upgrade permits Note, but the local view also needs boolean.
				// Receiving that partial upgrade must not cancel the remaining local expansion.
				remote.upgradeSchema();
				provider.synchronizeMessages();
				assert.equal(
					view.compatibility.canView,
					true,
					"An insufficient remote upgrade must not discard the local target schema.",
				);
				assert.equal(view.root === root, true);
				expectSchemaEqual(tree.kernel.storedSchema, toUpgradeSchema(expanded.schema));
				expectSchemaEqual(remoteTree.kernel.storedSchema, toUpgradeSchema(after.schema));
				assert.equal(provider.peekNextMessage(), undefined);
				assert.equal(publishedSchemas.length, 0);

				// A second remote commit uses the newly received schema. It must not erase
				// the remaining upgrade or trigger its submission either.
				remote.root.insertAtEnd(new Note({ text: "remote partial upgrade" }));
				provider.synchronizeMessages();
				assert.equal(view.compatibility.canView, true);
				assert.equal(root[1] instanceof Note, true);
				assert.equal(provider.peekNextMessage(), undefined);
				assert.equal(publishedSchemas.length, 0);
				root.insertAtEnd(true);
				provider.synchronizeMessages();
				assert.equal(publishedSchemas.length, 1);
				// The published upgrade must start from the received schema, not the
				// obsolete schema that was stored when the local upgrade was authored.
				expectSchemaEqual(publishedSchemas[0].schema.old, toUpgradeSchema(after.schema));
				expectSchemaEqual(publishedSchemas[0].schema.new, toUpgradeSchema(expanded.schema));
				expectSchemaEqual(remoteTree.kernel.storedSchema, toUpgradeSchema(expanded.schema));
				assert.deepEqual(
					tree.kernel.checkout.exportVerbose(),
					remoteTree.kernel.checkout.exportVerbose(),
				);
			} finally {
				stopTracking();
				view.dispose();
				remote.dispose();
			}
		});

		// TODO: Enable when a compatible, non-equivalent schema change preserves existing node references.
		// Currently compatibility is correct, but rebase replaces the root object.
		it.skip("adopts a compatible covering schema without downgrading unknown optional fields", () => {
			const { provider, remoteTree, tree, publishedSchemas, stopTracking } = createProvider();
			const factory = new SchemaFactoryBeta("schemaBufferCovering");
			const originalSchema = factory.object("CoveringDocument", { title: factory.string });
			const localSchema = factory.object(
				"CoveringDocument",
				{ title: factory.string, note: factory.optional(factory.string) },
				{ allowUnknownOptionalFields: true },
			);
			const remoteSchema = factory.object("CoveringDocument", {
				title: factory.string,
				note: factory.optional(factory.string),
				extra: factory.optional(factory.string),
			});
			const initial = remoteTree.kernel.viewWith(
				new TreeViewConfiguration({ schema: originalSchema }),
			);
			initial.initialize({ title: "initial" });
			provider.synchronizeMessages();
			initial.dispose();
			const view = tree.kernel.viewWith(new TreeViewConfiguration({ schema: localSchema }));
			view.upgradeSchema();
			const root = view.root;
			const remote = remoteTree.kernel.viewWith(
				new TreeViewConfiguration({ schema: remoteSchema }),
			);
			try {
				// The received schema is not equivalent to the local target. Its unknown
				// optional field is readable, but must never be removed by a stale upgrade.
				remote.upgradeSchema();
				remote.root.extra = "remote-only content";
				provider.synchronizeMessages();
				assert.equal(view.compatibility.canView, true);
				assert.equal(view.compatibility.isEquivalent, false);
				assert.equal(view.compatibility.canUpgrade, false);
				assert.equal(
					view.root === root,
					true,
					"A compatible covering upgrade must preserve existing node references.",
				);
				assert.equal(provider.peekNextMessage(), undefined);
				assert.equal(publishedSchemas.length, 0);

				view.runTransaction(() => {
					root.note = "aborted";
					return { rollback: true };
				});
				assert.equal(provider.peekNextMessage(), undefined);
				root.note = "local";
				provider.synchronizeMessages();
				root.title = "second local edit";
				provider.synchronizeMessages();
				assert.equal(remote.root.extra, "remote-only content");
				assert.equal(remote.root.note, "local");
				assert.equal(remote.root.title, "second local edit");
				assert.equal(publishedSchemas.length, 0);
				expectSchemaEqual(tree.kernel.storedSchema, toUpgradeSchema(remoteSchema));
				expectSchemaEqual(remoteTree.kernel.storedSchema, toUpgradeSchema(remoteSchema));
			} finally {
				stopTracking();
				view.dispose();
				remote.dispose();
			}
		});

		for (const withData of [false, true]) {
			it(`invalidates the view for an incompatible remote schema ${withData ? "with" : "without"} subsequent remote data`, () => {
				const { provider, remoteTree, tree, publishedSchemas, stopTracking } =
					createProvider();
				const expanded = new TreeViewConfiguration({
					schema: sf.array("Root", [sf.string, Note, sf.boolean]),
				});
				const initial = remoteTree.kernel.viewWith(before);
				initial.initialize(["initial"]);
				provider.synchronizeMessages();
				initial.dispose();
				const view = tree.kernel.viewWith(after);
				view.upgradeSchema();
				const remote = remoteTree.kernel.viewWith(expanded);
				const readability: boolean[] = [];
				const stopObserving = view.events.on("schemaChanged", () => {
					readability.push(view.compatibility.canView);
				});
				try {
					try {
						// This is a valid expansion of the document schema, but the local view
						// cannot read booleans. More permissive does not mean compatible.
						remote.upgradeSchema();
						if (withData) remote.root.insertAtEnd(true);
						provider.synchronizeMessages();
						assert.equal(view.compatibility.canView, false);
						assert.equal(view.compatibility.canUpgrade, false);
						assert.equal(readability.includes(false), true);
						assert.equal(provider.peekNextMessage(), undefined);
						assert.equal(publishedSchemas.length, 0);
						expectSchemaEqual(tree.kernel.storedSchema, toUpgradeSchema(expanded.schema));
						assert.deepEqual(
							tree.kernel.checkout.exportVerbose(),
							remoteTree.kernel.checkout.exportVerbose(),
						);
					} finally {
						stopObserving();
						view.dispose();
					}

					// Replacing an incompatible view is the normal application workflow.
					// Its first edit must not publish the old view's narrower schema.
					const replacement = tree.kernel.viewWith(expanded);
					try {
						replacement.root.insertAtEnd("local after view replacement");
						provider.synchronizeMessages();
						assert.deepEqual(
							[...remote.root],
							withData
								? ["initial", true, "local after view replacement"]
								: ["initial", "local after view replacement"],
						);
						assert.equal(publishedSchemas.length, 0);
						expectSchemaEqual(
							remoteTree.kernel.storedSchema,
							toUpgradeSchema(expanded.schema),
						);
					} finally {
						replacement.dispose();
					}
				} finally {
					stopTracking();
					remote.dispose();
				}
			});
		}
	});

	// TODO: Update the expected view incompatibility when buffered schema survives remote-data rebase.
	it("resubmits earlier in-flight data without adding later private schema to runtime replay", () => {
		const { provider, tree, remote, view } = setup();
		view.dispose();
		const old = tree.kernel.viewWith(before);
		// Disconnection does not detach the tree. Data enters runtime pending state,
		// while the later upgrade must remain in the separate submission buffer.
		tree.containerRuntime.connected = false;
		old.root.insertAtEnd("in flight");
		old.dispose();
		const local = tree.kernel.viewWith(after);
		try {
			local.upgradeSchema();
			remote.root.insertAtStart("remote");
			provider.synchronizeMessages();
			// Reconnect must replay only submitted data. Rebase can still drop the held
			// upgrade, so this test expects the newer view to become incompatible.
			tree.containerRuntime.connected = true;
			provider.synchronizeMessages();
			assert.deepEqual([...remote.root], ["remote", "initial", "in flight"]);
			assert.equal(local.compatibility.canView, false);
			assert.equal(provider.peekNextMessage(), undefined);
		} finally {
			local.dispose();
			remote.dispose();
		}
	});

	it("rehydrates submitted schema and data from runtime pending state", async () => {
		const provider = await TestTreeProvider.create(
			2,
			SummarizeType.disabled,
			new SharedTreeTestFactory(() => {}, undefined, {
				bufferSchemaUpgrades: true,
			}),
		);
		const initial = provider.trees[0].kernel.viewWith(before);
		initial.initialize(["initial"]);
		await provider.ensureSynchronized();
		initial.dispose();
		const view = provider.trees[0].kernel.viewWith(after);
		const container = provider.containers[0];
		// Use the real container pending-state path. Pausing transport keeps the
		// publication pending after the data edit releases it from the tree's buffer.
		await provider.opProcessingController.pauseProcessing(container);
		view.upgradeSchema();
		view.root.insertAtEnd(new Note({ text: "stashed" }));
		// These commits already crossed the submission boundary. Restoring them must
		// recreate runtime pending entries rather than wait for a new application edit.
		const pending = await getRequiredPendingLocalState(container);
		container.close();
		provider.opProcessingController.resumeProcessing();
		const loadedContainer = await provider.loadTestContainer(undefined, undefined, pending);
		const dataStore = (await loadedContainer.getEntryPoint()) as TestFluidObjectInternal;
		const tree = await dataStore.getInitialSharedObject("TestSharedTree");
		assert(SharedTreeKind.is(tree));
		const loaded = asAlpha(tree.viewWith(after));
		await waitForContainerConnection(loadedContainer, true);
		await provider.ensureSynchronized();
		const restored = loaded.root[1];
		assert(restored instanceof Note);
		assert.equal(restored.text, "stashed");
		loaded.dispose();
	});

	it("does not re-buffer a schema op that was submitted before enabling the policy", async () => {
		const immediate = new SharedTreeTestFactory(() => {});
		const buffered = new SharedTreeTestFactory(() => {}, undefined, {
			bufferSchemaUpgrades: true,
		});
		// Model an application update that enables buffering when restoring a container.
		const factory = {
			type: buffered.type,
			attributes: buffered.attributes,
			create: immediate.create.bind(immediate),
			load: buffered.load.bind(buffered),
		};
		const provider = await TestTreeProvider.create(2, SummarizeType.disabled, factory);
		const original = provider.trees[0].kernel.viewWith(before);
		original.initialize(["initial"]);
		await provider.ensureSynchronized();
		original.dispose();
		const view = provider.trees[0].kernel.viewWith(after);
		const container = provider.containers[0];
		await provider.opProcessingController.pauseProcessing(container);
		// No data edit follows this immediate-mode upgrade. Reload must submit the
		// saved schema op even though the new policy would hold a newly authored one.
		view.upgradeSchema();
		const pending = await getRequiredPendingLocalState(container);
		container.close();
		provider.opProcessingController.resumeProcessing();
		const loadedContainer = await provider.loadTestContainer(undefined, undefined, pending);
		await waitForContainerConnection(loadedContainer, true);
		await provider.ensureSynchronized();
		const peer = provider.trees[1].kernel.viewWith(after);
		try {
			assert.equal(
				peer.compatibility.canView,
				true,
				"An already-submitted schema was buffered again during replay.",
			);
		} finally {
			peer.dispose();
		}
	});

	it("rolls back a queued publication in native data-before-schema order", () => {
		// Turn-based mode lets the runtime accept the schema and data without sending
		// them to the service yet, so runtime rollback can cancel both pending ops.
		const { provider, tree, remote, view } = setup(FlushMode.TurnBased);
		const removed: string[][] = [];
		const off = view.checkout.mainBranch.events.on("afterChange", (event) => {
			if (event.type === "remove") {
				removed.push(
					...event.removedCommits.map((commit) =>
						commit.change.changes.map((part) => part.type),
					),
				);
			}
		});
		try {
			view.upgradeSchema();
			view.root.insertAtEnd(new Note({ text: "cancelled" }));
			const runtime = tree.containerRuntime;
			assert(runtime instanceof MockContainerRuntime && runtime.rollback !== undefined);
			runtime.rollback();
			provider.synchronizeMessages();
			assert.deepEqual(removed, [["data"], ["schema"]]);
			assert.equal(provider.peekNextMessage(), undefined);
			assert.equal(
				view.compatibility.canView,
				false,
				"Rollback must not secretly recreate schema.",
			);
			expectSchemaEqual(tree.kernel.storedSchema, toUpgradeSchema(before.schema));
			// Cancellation does not recreate the upgrade. A later attempt needs a new explicit request.
			view.upgradeSchema();
			view.root.insertAtEnd(new Note({ text: "new request" }));
			provider.synchronizeMessages();
			assert.equal(view.root.length, 2);
		} finally {
			off();
			view.dispose();
			remote.dispose();
		}
	});

	// Summarizer clients should never queue schema upgrades for submission.
	// Therefore, we do not expect them to ever have buffered commits.
	// If a summarizer client does have buffered commits, it indicates a violation of this expectation.
	it("asserts when summarizing a tree with buffered commits", async () => {
		const { provider, tree, remote, view } = setup();
		try {
			// The same tree can summarize before the local schema upgrade is buffered.
			await tree.summarize();
			view.upgradeSchema();
			const branch = view.checkout.mainBranch;
			const bufferedHead = branch.getHead();
			assert.notEqual(bufferedHead, tree.kernel.getTrunkHead());
			assert.equal(provider.peekNextMessage(), undefined);

			await assert.rejects(tree.summarize(), validateBufferedSummaryAssertion);

			// The assertion must neither flush the buffer nor discard the local change.
			assert.equal(branch.getHead(), bufferedHead);
			assert.equal(provider.peekNextMessage(), undefined);
		} finally {
			// The expected assertion breaks the local tree. Do not clear its error state
			// or dispose its view, which would mask the assertion under test.
			remote.dispose();
		}
	});

	it("does not flush or serialize private schema for shared branch creation", () => {
		const { provider, tree, remote, view } = setup();
		view.upgradeSchema();
		const branch = view.checkout.mainBranch;
		const head = branch.getHead();
		// A shared branch must not inherit schema that other clients have never received.
		// The usage error breaks the local tree. Use the retained branch reference
		// for assertions afterward; do not clear the broken state for this test.
		assert.throws(
			() => tree.createSharedBranch("private"),
			/Cannot create a shared branch from buffered/,
		);
		assert.equal(branch.getHead(), head);
		assert.equal(provider.peekNextMessage(), undefined);
		remote.dispose();
	});

	it("rejects rollback beneath an unpublished suffix before changing local history", () => {
		const { provider, tree, remote, view } = setup(FlushMode.TurnBased);
		view.dispose();
		const old = tree.kernel.viewWith(before);
		old.root.insertAtEnd("queued data");
		old.dispose();
		const local = tree.kernel.viewWith(after);
		local.upgradeSchema();
		// Only the earlier data is in runtime pending state. Its rollback would need
		// to cross a newer, never-submitted schema commit, which this prototype refuses.
		const head = local.checkout.mainBranch.getHead();
		const runtime = tree.containerRuntime;
		assert(runtime instanceof MockContainerRuntime && runtime.rollback !== undefined);
		const rollback = runtime.rollback.bind(runtime);
		assert.throws(rollback, /Cannot roll back a submitted commit beneath buffered/);
		assert.equal(tree.kernel.checkout.mainBranch.getHead(), head);
		assert.equal(provider.peekNextMessage(), undefined);
		remote.dispose();
	});

	for (const attachState of [AttachState.Detached, AttachState.Attached]) {
		it(`includes detached upgrades in attach summaries with a ${attachState} runtime`, async () => {
			// The tree stays detached in both cases, including when its runtime is attached.
			const { runtime, runtimeFactory, factory, tree, view } = setupDetached(attachState);
			try {
				view.upgradeSchema();
				// Local sequencing makes the upgrade part of initial state without sending an op.
				assert.equal(tree.kernel.getLocalBranch().getHead(), tree.kernel.getTrunkHead());
				assert.equal(runtimeFactory.outstandingMessageCount, 0);
				const { summary } = tree.getAttachSummary();
				// Load a fresh tree from the summary alone. Reuse the mock runtime's ID
				// compressor so the summary's identifiers remain available to this fixture.
				const loaded = await factory.load(
					runtime,
					"loaded",
					{
						deltaConnection: runtime.createDeltaConnection(),
						objectStorage: MockStorage.createFromSummary(summary),
					},
					factory.attributes,
				);
				const loadedView = loaded.kernel.viewWith(after);
				try {
					expectSchemaEqual(loaded.kernel.storedSchema, toUpgradeSchema(after.schema));
					// Read without another upgrade to prove the summary carried the newer schema.
					assert.deepEqual([...loadedView.root], ["initial"]);
					assert.equal(loaded.kernel.getLocalBranch().getHead(), loaded.kernel.getTrunkHead());
					assert.equal(runtimeFactory.outstandingMessageCount, 0);
				} finally {
					loadedView.dispose();
				}
			} finally {
				view.dispose();
			}
		});
	}

	for (const rollback of [false, true]) {
		it(`${rollback ? "aborts" : "commits"} a detached upgrade-only transaction without ops`, () => {
			const { runtimeFactory, tree, view } = setupDetached();
			try {
				const head = tree.kernel.getTrunkHead();
				// There is no data trigger. Commit must sequence the upgrade locally;
				// abort must instead restore the old schema without advancing history.
				view.runTransaction(() => {
					view.upgradeSchema();
					return rollback ? { rollback: true } : undefined;
				});
				assert.equal(tree.kernel.getLocalBranch().getHead(), tree.kernel.getTrunkHead());
				assert.equal(tree.kernel.getTrunkHead() === head, rollback);
				assert.equal(view.compatibility.canView, !rollback);
				expectSchemaEqual(
					tree.kernel.storedSchema,
					toUpgradeSchema(rollback ? before.schema : after.schema),
				);
				assert.equal(runtimeFactory.outstandingMessageCount, 0);
				assert.doesNotThrow(() => tree.getAttachSummary());
			} finally {
				view.dispose();
			}
		});
	}

	it("waits for validation before sequencing a detached upgrade locally", () => {
		const { runtimeFactory, tree, view } = setupDetached();
		const checkout = view.checkout;
		const onCommitValid = checkout.onCommitValid;
		const callbacks: (() => void)[] = [];
		// Bypassing the buffer policy must not bypass validation. Hold the callback
		// to expose the interval between local application and local sequencing.
		checkout.onCommitValid = (commit, callback) => {
			callbacks.push(() => onCommitValid.call(checkout, commit, callback));
			return false;
		};
		try {
			const trunk = tree.kernel.getTrunkHead();
			view.upgradeSchema();
			assert.equal(tree.kernel.getTrunkHead(), trunk);
			assert.notEqual(tree.kernel.getLocalBranch().getHead(), trunk);
			assert.equal(callbacks.length, 1);
			// Validation alone must finish detached submission; no later data edit is needed.
			callbacks[0]();
			assert.equal(tree.kernel.getLocalBranch().getHead(), tree.kernel.getTrunkHead());
			assert.equal(runtimeFactory.outstandingMessageCount, 0);
			assert.doesNotThrow(() => tree.getAttachSummary());
		} finally {
			checkout.onCommitValid = onCommitValid;
			view.dispose();
		}
	});

	it("serializes detached upgrades and starts buffering after container attachment", async () => {
		// Start without the provider's automatically attached trees so this test
		// exercises the real detached serialization and attachment lifecycle.
		const provider = await TestTreeProvider.create(
			0,
			SummarizeType.disabled,
			new SharedTreeTestFactory(() => {}, undefined, { bufferSchemaUpgrades: true }),
		);
		const loader = provider.makeTestLoader();
		const container = await loader.createDetachedContainer(provider.defaultCodeDetails);
		const dataStore = (await container.getEntryPoint()) as TestFluidObjectInternal;
		const tree = await dataStore.getInitialSharedObjectTyped(
			DefaultTestSharedTreeKind,
			"TestSharedTree",
		);
		const initial = tree.kernel.viewWith(before);
		initial.initialize(["initial"]);
		initial.dispose();
		const view = tree.kernel.viewWith(after);
		view.upgradeSchema();
		// Serialize before any data edit can trigger a flush. The saved initial state
		// must already include the upgrade, without relying on this live tree afterward.
		const serialized = container.serialize();
		view.dispose();
		container.close();

		const rehydrated = await loader.rehydrateDetachedContainerFromSnapshot(serialized);
		const rehydratedStore = (await rehydrated.getEntryPoint()) as TestFluidObjectInternal;
		const rehydratedTree = await rehydratedStore.getInitialSharedObjectTyped(
			DefaultTestSharedTreeKind,
			"TestSharedTree",
		);
		const restored = rehydratedTree.kernel.viewWith(after);
		// Rehydration must make the newer view readable without requesting another upgrade.
		assert.deepEqual([...restored.root], ["initial"]);
		restored.dispose();
		await rehydrated.attach(provider.driver.createCreateNewRequest(provider.documentId));
		// Attachment bypassed the provider's usual creation helper. Record the resolved
		// document ID so its load helper opens the document that was actually attached.
		provider.updateDocumentId(rehydrated.resolvedUrl);
		assert.equal(rehydratedTree.isAttached(), true);

		const peerContainer = await provider.loadTestContainer();
		const peerStore = (await peerContainer.getEntryPoint()) as TestFluidObjectInternal;
		const peerTree = await peerStore.getInitialSharedObjectTyped(
			DefaultTestSharedTreeKind,
			"TestSharedTree",
		);
		expectSchemaEqual(peerTree.kernel.storedSchema, toUpgradeSchema(after.schema));
		// A third schema requires a new upgrade on the same tree after attachment.
		// This catches a bypass that was fixed at construction rather than checked per append.
		const expanded = new TreeViewConfiguration({
			schema: sf.array("Root", [sf.string, Note, sf.boolean]),
		});
		const later = rehydratedTree.kernel.viewWith(expanded);
		try {
			const trunk = rehydratedTree.kernel.getTrunkHead();
			later.upgradeSchema();
			await provider.ensureSynchronized();
			assert.equal(rehydratedTree.kernel.getTrunkHead(), trunk);
			assert.notEqual(rehydratedTree.kernel.getLocalBranch().getHead(), trunk);
			expectSchemaEqual(peerTree.kernel.storedSchema, toUpgradeSchema(after.schema));
			// This edit now needs the usual ordered schema/data publication to reach the peer.
			later.root.insertAtEnd(true);
			await provider.ensureSynchronized();
			const peer = peerTree.kernel.viewWith(expanded);
			try {
				assert.deepEqual([...peer.root], ["initial", true]);
			} finally {
				peer.dispose();
			}
		} finally {
			later.dispose();
		}
	});

	it("attaches an upgraded new tree in an already attached container", async () => {
		const factory = new SharedTreeTestFactory(() => {}, undefined, {
			bufferSchemaUpgrades: true,
		});
		const provider = await TestTreeProvider.create(2, SummarizeType.disabled, factory);
		const dataStore =
			(await provider.containers[0].getEntryPoint()) as TestFluidObjectInternal;
		// Creating a channel does not attach it. Delay binding until after the upgrade
		// to check DDS-level attachment rather than just the container's state.
		const tree = dataStore.runtime.createChannel("newTree", factory.type);
		assert(DefaultTestSharedTreeKind.is(tree));
		assert.equal(dataStore.runtime.attachState, AttachState.Attached);
		assert.equal(tree.isAttached(), false);
		const initial = tree.kernel.viewWith(before);
		initial.initialize(["initial"]);
		initial.dispose();
		const view = tree.kernel.viewWith(after);
		try {
			view.upgradeSchema();
			assert.equal(tree.kernel.getLocalBranch().getHead(), tree.kernel.getTrunkHead());
			// Binding creates the DDS attach op with its initial summary. The peer must
			// receive the upgraded schema through that summary, not a separate schema op.
			tree.bindToContext();
			assert.equal(tree.isAttached(), true);
			await provider.ensureSynchronized();
			const peerStore =
				(await provider.containers[1].getEntryPoint()) as TestFluidObjectInternal;
			const peerTree = await peerStore.runtime.getChannel("newTree");
			assert(DefaultTestSharedTreeKind.is(peerTree));
			const peer = peerTree.kernel.viewWith(after);
			try {
				assert.deepEqual([...peer.root], ["initial"]);
			} finally {
				peer.dispose();
			}
		} finally {
			view.dispose();
		}
	});

	it("does not reuse an old schema blob after buffered schema is published", async () => {
		const { provider, tree, remote, view } = setup();
		await tree.summarize();
		const previous = provider.sequenceNumber;
		// Apply the schema while its local change event can still report the previous
		// summary's sequence number. Publication must invalidate that summary's cached schema.
		view.upgradeSchema();
		view.root.insertAtEnd(new Note({ text: "published after summary" }));
		provider.synchronizeMessages();
		try {
			const summary = await tree.summarize(undefined, undefined, undefined, {
				summarySequenceNumber: provider.sequenceNumber,
				latestSummarySequenceNumber: previous,
				summaryPath: "test",
			});
			const indexes = summary.summary.tree.indexes;
			assert.equal(indexes.type, SummaryType.Tree);
			const schema = indexes.tree.Schema;
			assert.equal(schema.type, SummaryType.Tree);
			// A handle could reuse the old schema. Require a new blob after publication.
			assert.equal(schema.tree.SchemaString.type, SummaryType.Blob);
		} finally {
			view.dispose();
			remote.dispose();
		}
	});

	for (const trigger of ["constraint-only", "net-zero"] as const) {
		it(`flushes on a ${trigger} application commit`, () => {
			const provider = new TestTreeProviderLite(
				2,
				new SharedTreeTestFactory(() => {}, undefined, {
					bufferSchemaUpgrades: true,
					// Use a collaboration version whose change format supports the no-change constraint.
					minVersionForCollab: FluidClientVersion.v2_80,
				}),
			);
			const remote = provider.trees[0].kernel.viewWith(before);
			remote.initialize(["initial"]);
			provider.synchronizeMessages();
			const view = provider.trees[1].kernel.viewWith(after);
			try {
				view.upgradeSchema();
				// Neither case changes the final visible content, but both author a data
				// commit. The trigger depends on that commit, not a nonempty content delta.
				view.runTransaction(() => {
					if (trigger === "constraint-only") view.checkout.editor.addNoChangeConstraint();
					else {
						view.root.insertAtEnd(new Note({ text: "no net effect" }));
						view.root.removeAt(1);
					}
				});
				provider.synchronizeMessages();
				expectSchemaEqual(
					provider.trees[0].kernel.storedSchema,
					toUpgradeSchema(after.schema),
				);
				assert.deepEqual([...view.root], ["initial"]);
			} finally {
				view.dispose();
				remote.dispose();
			}
		});
	}
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { makeRandom } from "@fluid-private/stochastic-test-utils";

import { CommitKind, RevertibleStatus, type Revertible } from "../../core/index.js";
import { createIndependentTreeAlpha, TreeAlpha } from "../../shared-tree/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
	toUpgradeSchema,
} from "../../simple-tree/index.js";
import { expectSchemaEqual, TestTreeProviderLite } from "../utils.js";
// eslint-disable-next-line import-x/no-internal-modules -- Reuse the sandbox session's setup and teardown.
import { buildDirectSessionPorts, setupCustom } from "./sandboxing/sandboxingTestUtils.js";

describe("deferred schema upgrade configuration", () => {
	const sf = new SchemaFactory("deferredOption");
	class Note extends sf.object("Note", { text: sf.string }) {}
	const before = new TreeViewConfiguration({ schema: sf.array("Root", sf.string) });
	const after = new TreeViewConfigurationAlpha({
		schema: sf.array("Root", [sf.string, Note]),
		schemaUpgradeMode: "deferred",
	});

	function createScenario() {
		const provider = new TestTreeProviderLite(2);
		const remote = provider.trees[0].kernel.viewWith(before);
		remote.initialize(["initial"]);
		provider.synchronizeMessages();
		const tree = provider.trees[1];
		const view = tree.kernel.viewWith(after);
		return { provider, remote, tree, view };
	}

	it("requires an explicit upgrade and does not publish for read-only access", () => {
		const { provider, remote, tree, view } = createScenario();
		try {
			assert.equal(view.compatibility.canView, false);
			view.upgradeSchema();
			assert.equal(view.compatibility.canView, true);
			assert.deepEqual([...view.root], ["initial"]);
			TreeAlpha.exportVerbose(view.root);
			assert.equal(provider.peekNextMessage(), undefined);
			expectSchemaEqual(tree.kernel.checkout.storedSchema, toUpgradeSchema(before.schema));
			// Check the guard below the kernel's existing fail-stop wrapper for usage errors.
			assert.throws(
				() => tree.kernel.checkout.viewWith(after),
				/Cannot create a second tree view/,
			);
		} finally {
			view.dispose();
			remote.dispose();
		}
	});

	it("preserves public root identity and data-only undo through a recovery", () => {
		const { provider, remote, tree, view } = createScenario();
		const undo: Revertible[] = [];
		const off = view.events.on("changed", (metadata) => {
			if (metadata.isLocal && metadata.kind === CommitKind.Default) {
				const revertible = metadata.getRevertible();
				if (revertible !== undefined) {
					undo.push(revertible);
				}
			}
		});
		try {
			view.upgradeSchema();
			const root = view.root;
			const note = new Note({ text: "local" });
			remote.root.insertAtStart("remote");
			root.insertAtEnd(note);
			provider.synchronizeMessages();
			provider.synchronizeMessages();
			assert.equal(view.root === root, true);
			assert.equal(root[2] === note, true);
			assert.equal(undo.length, 1);
			undo[0].revert();
			provider.synchronizeMessages();
			assert.deepEqual([...root], ["remote", "initial"]);
			expectSchemaEqual(tree.kernel.checkout.storedSchema, toUpgradeSchema(after.schema));
		} finally {
			off();
			for (const revertible of undo) {
				if (revertible.status === RevertibleStatus.Valid) {
					revertible.dispose();
				}
			}
			view.dispose();
			remote.dispose();
		}
	});

	it("retains submitted work when the application replaces its public view", () => {
		const { provider, remote, tree, view } = createScenario();
		view.upgradeSchema();
		remote.root.insertAtStart("remote");
		view.root.insertAtEnd(new Note({ text: "retained" }));
		view.dispose();
		const replacement = tree.kernel.viewWith(after);
		try {
			provider.synchronizeMessages();
			provider.synchronizeMessages();
			const note = replacement.root[2];
			assert(note instanceof Note);
			assert.equal(note.text, "retained");
		} finally {
			replacement.dispose();
			remote.dispose();
		}
	});

	it("keeps fork edits private until merge and allows immediate mode on a replacement view", () => {
		const { provider, remote, tree, view } = createScenario();
		const fork = view.fork();
		try {
			fork.upgradeSchema();
			fork.root.insertAtEnd(new Note({ text: "fork" }));
			assert.equal(provider.peekNextMessage(), undefined);
			view.upgradeSchema();
			view.merge(fork, false);
			provider.synchronizeMessages();
			assert.equal(view.root.length, 2);
		} finally {
			fork.dispose();
			view.dispose();
			remote.dispose();
		}
		const immediateConfig = new TreeViewConfiguration({
			schema: sf.array("Root", [sf.string, Note, sf.number]),
		});
		const immediate = tree.kernel.viewWith(immediateConfig);
		immediate.upgradeSchema();
		assert.notEqual(provider.peekNextMessage(), undefined);
		provider.synchronizeMessages();
		expectSchemaEqual(
			tree.kernel.checkout.storedSchema,
			toUpgradeSchema(immediateConfig.schema),
		);
		immediate.dispose();
	});

	it("supports independent trees and abandons unused preparation on disposal", () => {
		const tree = createIndependentTreeAlpha();
		const initial = tree.viewWith(before);
		initial.initialize(["initial"]);
		initial.dispose();
		const view = tree.viewWith(after);
		view.upgradeSchema();
		view.dispose();
		const oldView = tree.viewWith(before);
		assert.equal(oldView.compatibility.canView, true);
		oldView.dispose();
		const reopened = tree.viewWith(after);
		reopened.upgradeSchema();
		reopened.root.insertAtEnd(new Note({ text: "independent" }));
		assert.equal(reopened.root.length, 2);
		reopened.dispose();
	});

	it("releases detached content on both checkouts after forwarded edits are trimmed", () => {
		const { provider, remote, tree, view } = createScenario();
		view.upgradeSchema();
		view.root.insertAtEnd("published");
		provider.synchronizeMessages();
		remote.dispose();
		const peer = provider.trees[0].kernel.viewWith(after);
		try {
			for (let index = 0; index < 20; index++) {
				view.runTransaction(() => {
					view.root.insertAtEnd(`${index}`);
					view.root.removeAt(2);
				});
				provider.synchronizeMessages();
			}
			// Advance both clients' reference sequence numbers beyond the removed content.
			peer.root.insertAtEnd("peer acknowledgement");
			provider.synchronizeMessages();
			view.root.insertAtEnd("local acknowledgement");
			provider.synchronizeMessages();
			assert.equal(view.checkout.getRemovedRoots().length, 0);
			assert.equal(tree.kernel.checkout.getRemovedRoots().length, 0);
		} finally {
			view.dispose();
			peer.dispose();
		}
	});

	it("synchronizes sandbox Host and Guest edits with deferred-mode views", async () => {
		const session = await setupCustom(["initial"], after, buildDirectSessionPorts);
		try {
			session.main.root.insertAtEnd("host");
			await session.host.updateGuestPromise;
			assert.deepEqual([...session.guestView.root], ["initial", "host"]);
			session.guestView.root.insertAtEnd("guest");
			await session.guest.updateHostPromise;
			session.provider.synchronizeMessages();
			assert.deepEqual([...session.main.root], ["initial", "host", "guest"]);
			assert.deepEqual([...session.peer.root], ["initial", "host", "guest"]);
		} finally {
			session.teardown();
		}
	});

	for (let seed = 0; seed < 10; seed++) {
		it(`converges after recovery and seeded editing (seed ${seed})`, () => {
			const { provider, remote, tree, view } = createScenario();
			const random = makeRandom(seed);
			view.upgradeSchema();
			remote.root.insertAtStart("remote");
			view.root.insertAtEnd(new Note({ text: "recovered" }));
			provider.synchronizeMessages();
			provider.synchronizeMessages();
			remote.dispose();
			const peer = provider.trees[0].kernel.viewWith(after);
			const views = [view, peer];
			const root = view.root;
			try {
				for (let step = 0; step < 40; step++) {
					const current = views[random.integer(0, 1)];
					const operation = random.integer(0, 3);
					if (operation === 0 || current.root.length === 0) {
						current.root.insertAt(random.integer(0, current.root.length), `${seed}:${step}`);
					} else if (operation === 1) {
						current.root.removeAt(random.integer(0, current.root.length - 1));
					} else if (operation === 2) {
						current.root.moveToEnd(random.integer(0, current.root.length - 1));
					} else {
						current.runTransaction(() => {
							current.root.insertAtEnd("aborted");
							return { rollback: true };
						});
					}
					if (step % 4 === 3) {
						provider.synchronizeMessages();
						assert.deepEqual(
							tree.kernel.checkout.exportVerbose(),
							provider.trees[0].kernel.checkout.exportVerbose(),
							`Clients diverged at seed ${seed}, step ${step}.`,
						);
					}
					assert.equal(
						view.root === root,
						true,
						`The authoring root changed at step ${step}.`,
					);
				}
			} finally {
				view.dispose();
				peer.dispose();
			}
		});
	}
});

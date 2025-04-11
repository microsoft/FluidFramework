/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Side } from "@fluidframework/merge-tree/internal";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";
import { MockContainerRuntimeFactoryForReconnection } from "@fluidframework/test-runtime-utils/internal";

import { assertConsistent, type Client } from "./intervalTestUtils.js";
import { constructClients } from "./multiClientTestUtils.js";

describe("Shared String Obliterate", () => {
	const datastoreRuntimeOptions = {
		mergeTreeEnableObliterate: true,
		mergeTreeEnableSidedObliterate: true,
		mergeTreeEnableObliterateReconnect: true,
	};

	function processAllMessages(
		containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection,
		clients: Client[],
	) {
		for (const { containerRuntime } of clients) {
			if (containerRuntime.connected) {
				containerRuntime.flush();
			}
		}
		containerRuntimeFactory.processAllMessages();
	}

	// Regression test found by fuzz testing: the interesting case that this test exercised is that
	// C calls rebase() after it already normalized segments once and then made changes to the tree
	// without inbounding any subsequent SharedString ops (so the last normalization refSeq was never advanced).
	it("Is able to compute correct rebased segments pre-normalization consistently", async () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection({
			flushMode: FlushMode.TurnBased,
			enableGroupedBatching: true,
		});

		const clients = constructClients(containerRuntimeFactory, 3, datastoreRuntimeOptions);
		const [
			{ containerRuntime: _runtimeA, sharedString: A },
			{ containerRuntime: _runtimeB, sharedString: B },
			{ containerRuntime: runtimeC, sharedString: C },
		] = clients;

		A.insertText(0, "0123456789");
		processAllMessages(containerRuntimeFactory, clients);

		B.insertText(0, "ABCD");
		runtimeC.connected = false;
		processAllMessages(containerRuntimeFactory, clients);
		C.insertText(0, "E");
		runtimeC.connected = true;
		C.obliterateRange({ pos: 5, side: Side.After }, { pos: 14, side: Side.Before });

		runtimeC.rebase();
		processAllMessages(containerRuntimeFactory, clients);
		await assertConsistent(clients);
	});

	// Regression test found by fuzz testing: this hit 0x348 when originally found. Previous logic in the resubmission
	// path held onto cached rebase results as long as refSeq didn't advance. This illustrates a case where refSeq remains
	// the same but subsequent local ops are applied before resubmission happens again.
	// Though rebase results could be constructed in a way where they remained valid over such changes, as implemented they
	// did not: the cache held onto segments which are no longer guaranteed to be valid after subsequent edits.
	// This test illustrates a case where that happens as the subsequent local edit splits one of the segments in the cache.
	// The fix applied at the time this test was added: invalidate any cached computations at the time of (re-)rebase
	// when we see there have been any remote OR local changes, rather than just remote ones.
	it("Invalidates cached obliterate rebased results on subsequent local ops", async () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection({
			flushMode: FlushMode.TurnBased,
			enableGroupedBatching: true,
		});

		// Only the first client performs ops, but having a second client is still useful for validating consistency.
		const clients = constructClients(containerRuntimeFactory, 2, datastoreRuntimeOptions);
		const [{ containerRuntime: runtimeA, sharedString: A }] = clients;

		A.insertText(0, "01234567");
		processAllMessages(containerRuntimeFactory, clients);

		A.obliterateRange({ pos: 4, side: Side.After }, { pos: 6, side: Side.Before });
		runtimeA.rebase();
		runtimeA.connected = false;
		A.obliterateRange({ pos: 3, side: Side.After }, { pos: 6, side: Side.After });
		runtimeA.connected = true;

		processAllMessages(containerRuntimeFactory, clients);
		await assertConsistent(clients);
	});
});

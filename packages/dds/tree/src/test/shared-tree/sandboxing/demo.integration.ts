/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	SerializationVersion,
	toIdCompressorWithCore,
} from "@fluidframework/id-compressor/internal";

import { disposeActiveSessions, setup } from "./sandboxingTestUtils.js";
import {
	cleanupEphemeralService,
	startEphemeralService,
} from "@fluidframework/local-driver/internal";
import {
	sharedObjectRegistryFromIterable,
	defineDataStore,
} from "@fluidframework/shared-object-base/internal";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type ITree,
	type ViewableTree,
} from "../../../simple-tree/index.js";
import { Sandboxing } from "../../../index.js";
import { SharedTreeAlpha } from "../../../treeFactory.js";
import type { SharedObjectCreator } from "@fluidframework/shared-object-base/internal";
import type { ITelemetryBaseEvent, LogLevel } from "@fluidframework/core-interfaces";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import { asBeta } from "../../../api.js";
import { getCheckout, sandboxFormatValidator } from "../../../sandboxing/index.js";

describe("End to End Host and Guest integrations", () => {
	afterEach(async function () {
		disposeActiveSessions(this.currentTest?.state === "failed");
		await cleanupEphemeralService();
	});

	// Demos which look more like real end user use.
	// Currently shows limitations which need fixing.
	describe("User Facing APIs", () => {
		let channel: MessageChannel | undefined;
		let host: Sandboxing.Host | undefined;
		let guest: Sandboxing.Guest | undefined;

		afterEach(() => {
			channel?.port2.close();
			guest?.dispose();
			host?.dispose();
			channel = undefined;
			guest = undefined;
			host = undefined;
		});

		// TODO: would be nice to make this use case possible with the simpler defineTreeDataStore.
		// defineTreeDataStore should get an overload or alternative which omits the config and does not crate the view for you.
		const TestDataStore = defineDataStore<ViewableTree, ITree>({
			type: "testTree",
			registry: sharedObjectRegistryFromIterable([SharedTreeAlpha]),
			async instantiateFirstTime(rootCreator: SharedObjectCreator): Promise<ITree> {
				return rootCreator.createSharedObject(SharedTreeAlpha);
			},
			async view(tree): Promise<ITree> {
				return tree;
			},
		});

		const config = new TreeViewConfiguration({ schema: SchemaFactory.string });

		it("synchronizes a Guest edit through ServiceClient", async () => {
			const client = startEphemeralService().defaultClient;
			const container = await client.createAttachedContainer(TestDataStore);
			const tree = container.data;
			// TODO: ideally we wouldn't require the host to create a view.
			// See existing TODO on `HostOptions.main` for details.
			const viewHost = asBeta(tree.viewWith(config));

			const log: string[] = [];
			const logger = createChildLogger({
				logger: {
					send(event: ITelemetryBaseEvent, logLevel: LogLevel) {
						log.push(JSON.stringify(event));
					},
				},
			});

			channel = new MessageChannel();

			// TODO: we need to expose a better way to do this.
			// eslint-disable-next-line @typescript-eslint/dot-notation -- needed to access private field
			const idCompressor = getCheckout(viewHost)["idCompressor"];
			const rootCompressor = toIdCompressorWithCore(idCompressor);
			assert.equal(Reflect.get(rootCompressor, "writeVersion"), SerializationVersion.V2);
			// TODO: Enable V3 through ContainerRuntime's document compatibility policy.
			// This override is only for this isolated test document.
			assert.equal(Reflect.set(rootCompressor, "writeVersion", SerializationVersion.V3), true);

			// TODO: we should not have to initialize first:
			viewHost.initialize("A");
			// TODO: This should not be required.
			await client.service.synchronize();

			host = Sandboxing.createHost({
				logger,
				main: viewHost,
				port: channel.port1,
			});
			guest = await Sandboxing.createGuest({
				logger,
				port: channel.port2,
				treeOptions: { jsonValidator: sandboxFormatValidator },
			});
			const viewGuest = guest.tree.viewWith(config);
			// TODO: Support initializing the tree in the Guest instead of requiring Host initialization.
			// viewGuest.initialize("B");
			viewGuest.root = "B";
			await (guest.updateHostPromise ?? assert.fail("Expected a pending Guest edit"));
			await client.service.synchronize();

			assert.equal(viewHost.root, "B");
			assert.equal(host.error, undefined);
			assert.equal(guest.error, undefined);
			guest.dispose();
			host.dispose();
			assert.equal(rootCompressor.getShardSyncToken(), undefined);
		});
	});

	it("the initial state is consistent across the Host and Guest", async () => {
		const { main, local, guestView } = await setup(["A"]);
		assert.deepEqual([...guestView.root], ["A"]);
		assert.deepEqual([...local.root], ["A"]);
		assert.deepEqual([...main.root], ["A"]);
	});

	it("one Guest edit", async () => {
		const { peer, main, local, guest, guestView, provider } = await setup([]);

		// Edit in the Guest.
		guestView.root.push("B(g)");
		// The edit is synchronously reflected in the Guest.
		assert.deepEqual([...guestView.root], ["B(g)"]);
		// The edit is not reflected in the Host yet.
		assert.deepEqual([...local.root], []);
		assert.deepEqual([...main.root], []);

		// The Guest should have started to push the edit to the Host.
		const pushPromise =
			guest.updateHostPromise ?? assert.fail("Expected push to be in progress");
		// Wait for the edit to be pushed to the Host.
		await pushPromise;

		// The edit is now reflected in the Host.
		assert.deepEqual([...local.root], ["B(g)"]);
		assert.deepEqual([...main.root], ["B(g)"]);
		// The edit is not reflected in the peer yet.
		assert.deepEqual([...peer.root], []);

		provider.synchronizeMessages();
		// The edit is now reflected in the peer.
		assert.deepEqual([...peer.root], ["B(g)"]);
	});

	it("new Guest edits during Guest edit push", async () => {
		const { peer, main, local, guest, guestView, provider } = await setup([]);

		// Edit in the Guest.
		guestView.root.push("B(g)");
		const pushPromise =
			guest.updateHostPromise ?? assert.fail("Expected push to be in progress");

		// Before the push completes, make more edits in the Guest.
		guestView.root.push("C(g)");
		guestView.root.push("D(g)");
		// The new edits are synchronously reflected in the Guest.
		assert.deepEqual([...guestView.root], ["B(g)", "C(g)", "D(g)"]);
		// The new edits are not reflected in the Host yet.
		assert.deepEqual([...local.root], []);
		assert.deepEqual([...main.root], []);

		await pushPromise;
		// The edits are now reflected in the Host.
		assert.deepEqual([...local.root], ["B(g)", "C(g)", "D(g)"]);
		assert.deepEqual([...main.root], ["B(g)", "C(g)", "D(g)"]);
		// The edits are not reflected in the peer yet.
		assert.deepEqual([...peer.root], []);

		provider.synchronizeMessages();
		// The edits are now reflected in the peer.
		assert.deepEqual([...peer.root], ["B(g)", "C(g)", "D(g)"]);
	});

	it("concurrent Guest, Host, and peer edits converge", async () => {
		const { peer, host, main, local, guest, guestView, provider } = await setup([]);

		// Each participant edits independently before any synchronization completes.
		guestView.root.push("Guest");
		const pushPromise =
			guest.updateHostPromise ?? assert.fail("Expected push to be in progress");
		main.root.push("Host");
		peer.root.push("Peer");

		assert.deepEqual([...guestView.root], ["Guest"]);
		assert.deepEqual([...main.root], ["Host"]);
		assert.deepEqual([...peer.root], ["Peer"]);

		// Sequence the Host and peer edits while the Guest edit is still being pushed.
		provider.synchronizeMessages();
		const updatePromise =
			host.updateGuestPromise ?? assert.fail("Expected update to be in progress");
		assert.equal(guest.updateHostPromise, pushPromise);

		// Full-duplex synchronization processes both directions concurrently.
		await Promise.all([pushPromise, updatePromise]);

		// Sequence the Guest edit and wait for the resulting Host update.
		provider.synchronizeMessages();
		await host.updateGuestPromise;

		// The provider flushes immediately, so Host is submitted before Peer.
		// Guest crosses the asynchronous sandbox channel and is submitted last.
		// Concurrent inserts at the same position end up in reverse sequencing order.
		const expected = ["Guest", "Peer", "Host"];
		assert.deepEqual([...guestView.root], expected);
		assert.deepEqual([...local.root], expected);
		assert.deepEqual([...main.root], expected);
		assert.deepEqual([...peer.root], expected);
	});

	it("one peer edit", async () => {
		const { peer, host, main, local, guestView, provider } = await setup([]);

		// Edit on the peer.
		peer.root.push("B(p)");
		// The edit is synchronously reflected in the peer.
		assert.deepEqual([...peer.root], ["B(p)"]);
		// The edit is not reflected in the Host or the Guest yet.
		assert.deepEqual([...local.root], []);
		assert.deepEqual([...main.root], []);
		assert.deepEqual([...guestView.root], []);

		provider.synchronizeMessages();
		// The edit is now reflected in the Host but not in the local branch or Guest.
		assert.deepEqual([...main.root], ["B(p)"]);
		assert.deepEqual([...local.root], []);
		assert.deepEqual([...guestView.root], []);

		// The Host should have started to update the Guest with the peer change.
		const updatePromise =
			host.updateGuestPromise ?? assert.fail("Expected update to be in progress");
		// Wait for the update to be applied to the Guest.
		await updatePromise;

		// The peer edit is now reflected in the local branch and Guest.
		assert.deepEqual([...local.root], ["B(p)"]);
		assert.deepEqual([...guestView.root], ["B(p)"]);
	});

	it("new peer edits during Guest update", async () => {
		const { peer, host, main, local, guestView, provider } = await setup([]);

		// Edit on the peer.
		peer.root.push("B(p)");
		provider.synchronizeMessages();
		// The new peer edit is reflected in the Host but not in the local branch or Guest.
		assert.deepEqual([...main.root], ["B(p)"]);
		assert.deepEqual([...local.root], []);
		assert.deepEqual([...guestView.root], []);

		// The Host should have started to update the Guest with the peer change.
		const updatePromise =
			host.updateGuestPromise ?? assert.fail("Expected update to be in progress");

		// Before the update is applied to the Guest, more edits arrive from the peer.
		peer.root.push("C(p)");
		peer.root.push("D(p)");
		provider.synchronizeMessages();
		// The new peer edits are reflected in the Host but not in the local branch or Guest.
		assert.deepEqual([...main.root], ["B(p)", "C(p)", "D(p)"]);
		assert.deepEqual([...local.root], []);
		assert.deepEqual([...guestView.root], []);

		await updatePromise;
		// After the promise resolves, all peer edits are reflected in the local branch and Guest.
		assert.deepEqual([...local.root], ["B(p)", "C(p)", "D(p)"]);
		assert.deepEqual([...guestView.root], ["B(p)", "C(p)", "D(p)"]);
	});
});

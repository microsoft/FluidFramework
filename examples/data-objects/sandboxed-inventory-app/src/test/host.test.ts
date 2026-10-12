/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createOrLoadExampleContainer } from "@fluid-example/example-utils";
import {
	cleanupEphemeralService,
	getDefaultEphemeralService,
} from "@fluidframework/local-driver/alpha";
import { asBeta, Sandboxing } from "@fluidframework/tree/alpha";
import globalJsdom from "global-jsdom";

import { loadHost, type HostContainer } from "../host.js";
import { InventoryDataStore } from "../inventoryList.js";

describe("Host container loading", () => {
	let cleanupDom: () => void;
	const containers: HostContainer[] = [];

	beforeEach(() => {
		cleanupDom = globalJsdom(undefined, {
			url: "http://localhost/?fluidClient=ephemeral",
		});
	});

	afterEach(async () => {
		try {
			for (const container of containers.splice(0)) {
				container.data.dispose();
				container.close();
			}
			await cleanupEphemeralService();
		} finally {
			cleanupDom();
		}
	});

	it("creates an initialized inventory and records its container ID in the URL", async () => {
		const container = await loadHost();
		containers.push(container);
		assert(container.id !== undefined);
		assert.equal(location.hash, `#${container.id}`);
		assert.deepEqual(
			[...container.data.root.parts].map(({ name, quantity }) => ({ name, quantity })),
			[
				{ name: "nut", quantity: 0 },
				{ name: "bolt", quantity: 0 },
			],
		);
	});

	it("loads the same inventory without reinitializing accepted edits", async () => {
		const first = await loadHost();
		containers.push(first);
		first.data.root.parts.insertAtEnd({ name: "washer", quantity: 4 });
		await getDefaultEphemeralService().synchronize();

		const service = getDefaultEphemeralService().newClient({
			// The Sandboxing APIs require at least client version 3.4.0.
			oldestSupportedClient: "3.4.0",
		});
		const loaded = await createOrLoadExampleContainer<HostContainer["data"]>(
			service,
			InventoryDataStore,
		);
		containers.push(loaded);
		assert.equal(loaded.id, first.id);
		assert.notEqual(loaded, first);
		assert.deepEqual(
			[...loaded.data.root.parts].map((part) => part.name),
			["nut", "bolt", "washer"],
		);
		assert.equal(loaded.data.root.parts[2]?.quantity, 4);
	});

	it("supports sandbox initialization while keeping the application view independently owned", async () => {
		const container = await loadHost();
		containers.push(container);
		const channel = new MessageChannel();
		let host: Sandboxing.Host | undefined;
		try {
			host = Sandboxing.createHost({
				main: asBeta(container.data),
				port: channel.port1,
			});
			host.dispose();
			container.data.root.parts.insertAtEnd({ name: "washer", quantity: 1 });
			assert.equal(container.data.root.parts.at(-1)?.name, "washer");
		} finally {
			channel.port2.close();
			host?.dispose();
			channel.port1.close();
		}
	});
});

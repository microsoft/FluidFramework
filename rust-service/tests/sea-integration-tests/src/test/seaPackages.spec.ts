/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { setImmediate } from "node:timers/promises";
import { describe, it } from "mocha";

import { createSeaServiceClient } from "@fluidframework/sea-driver/internal";
import type { FluidContainer } from "@fluidframework/driver-definitions/internal";
import { createSeaFactories } from "@fluidframework/sea-typescript/internal/presets";
import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { defineTreeDataStore } from "@fluidframework/tree/internal";

describe("Sea ServiceClient integration", () => {
	for (const preset of ["split", "combined"] as const) {
		it(`supports detached/attached creation and reload (${preset})`, async () => {
			const service = await createSeaFactories({
				preset,
				environment: "node",
			}).createMemoryService();
			const containers: FluidContainer[] = [];
			try {
				let opens = 0;
				const client = createSeaServiceClient({
					oldestSupportedClient: "2.20.0",
					openSession: async (document, options) => {
						opens += 1;
						return service.open(document, options);
					},
				});
				const schema = new SchemaFactory(`service-client-${preset}`);
				/** Mutable root used to exercise runtime initialization and live operation replay. */
				class State extends schema.object("State", { value: schema.number }) {}
				const kind = defineTreeDataStore({
					type: "service-client-state",
					config: new TreeViewConfiguration({ schema: State }),
					initializer: () => new State({ value: 0 }),
				});
				const detached = await client.createContainer(kind);
				containers.push(detached);
				assert.equal(detached.id, undefined);
				assert.equal(opens, 0);
				detached.data.root.value = 7;
				const attaching = detached.attach();
				await assert.rejects(detached.attach(), /attach already in progress/u);
				const attached = await attaching;
				assert.equal(attached, detached);
				assert.match(attached.id, /^(?:[0-9a-f]{2})+$/u);
				await assert.rejects(detached.attach(), /already attached/u);
				const loaded = await client.loadContainer(attached.id, kind);
				containers.push(loaded);
				const converged = (): boolean => loaded.data.root.value === 11;
				assert.equal(loaded.id, attached.id);
				assert.equal(loaded.data.root.value, 7);
				attached.data.root.value = 11;
				const deadline = Date.now() + 5_000;
				while (!converged()) {
					assert.ok(Date.now() < deadline, "loaded ServiceClient container did not converge");
					await setImmediate();
				}
				attached.close();
				loaded.close();
				const reopened = await client.loadContainer(attached.id, kind);
				containers.push(reopened);
				assert.equal(reopened.data.root.value, 11);
				const fresh = await client.createAttachedContainer(kind);
				containers.push(fresh);
				assert.notEqual(fresh.id, attached.id);
				assert.equal(fresh.data.root.value, 0);
			} finally {
				try {
					for (const container of containers) container.close();
				} finally {
					service.close();
				}
			}
		}).timeout(15_000);
	}
});

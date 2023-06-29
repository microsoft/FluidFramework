/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	MockFluidDataStoreRuntime,
	MockContainerRuntimeFactoryForRebasing,
	MockContainerRuntimeForRebasing,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { MapFactory, AttributableMap } from "../../map";

describe("Rebasing", () => {
	let containerRuntimeFactory: MockContainerRuntimeFactoryForRebasing;
	let containerRuntime1: MockContainerRuntimeForRebasing;
	let containerRuntime2: MockContainerRuntimeForRebasing;
	let map1: AttributableMap;
	let map2: AttributableMap;

	beforeEach(async () => {
		containerRuntimeFactory = new MockContainerRuntimeFactoryForRebasing();

		// Create the first SharedMap.
		const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
		containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
		const services1 = {
			deltaConnection: containerRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};
		map1 = new AttributableMap("shared-map-1", dataStoreRuntime1, MapFactory.Attributes);
		map1.connect(services1);

		// Create the second SharedMap.
		const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
		containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
		const services2 = {
			deltaConnection: containerRuntime2.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};
		map2 = new AttributableMap("shared-map-2", dataStoreRuntime2, MapFactory.Attributes);
		map2.connect(services2);
	});

	it("Rebasing ops maintains eventual consistency", async () => {
		const keyCount = 10;
		for (let i = 0; i < keyCount; i++) {
			map1.set(`${i}`, map1.size);
		}

		containerRuntimeFactory.processOneMessage();
		containerRuntime1.rebase();
		containerRuntimeFactory.processAllMessages();

		for (let i = 0; i < keyCount; i++) {
			assert.strictEqual(map1.get(`${i}`), i);
			assert.strictEqual(map2.get(`${i}`), i);
		}

		const deleteThreshold = 5;
		for (let i = 0; i < deleteThreshold - 1; i++) {
			map2.delete(`${i}`);
		}

		map1.delete(`${deleteThreshold - 1}`);

		containerRuntimeFactory.processOneMessage();
		containerRuntime1.rebase();
		containerRuntimeFactory.processAllMessages();

		for (let i = 0; i < 10; i++) {
			const expected = i < deleteThreshold ? undefined : i;
			assert.strictEqual(map1.get(`${i}`), expected);
			assert.strictEqual(map2.get(`${i}`), expected);
		}
	});
});

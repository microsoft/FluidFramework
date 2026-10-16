/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils/internal";

import { PoisonedDDSFuzzHandle } from "../ddsFuzzHandle.js";
import { DDSFuzzSerializer } from "../fuzzSerializer.js";

describe("DDS fuzz handle serialization", () => {
	it("preserves poisoned handles through runtime encoding", () => {
		const factory = new MockContainerRuntimeFactory();
		const dataStore = new MockFluidDataStoreRuntime();
		const runtime = factory.createContainerRuntime(dataStore);
		const handle = new PoisonedDDSFuzzHandle("poisoned", dataStore, "creator");
		runtime.submit({ handle });
		factory.processAllMessages();

		const content: unknown = runtime.deltaManager.lastMessage?.contents;
		assert.deepEqual(content, {
			handle: {
				type: "__fluid_handle__",
				url: handle.absolutePath,
				poisoned: true,
				creatingClientId: "creator",
			},
		});
		const creatorSerializer = new DDSFuzzSerializer(dataStore, "creator");
		assert.doesNotThrow(() => creatorSerializer.decode(content));
		const otherSerializer = new DDSFuzzSerializer(dataStore, "other");
		assert.throws(
			() => otherSerializer.decode(content),
			/Poisoned handle created by client creator should not be referenced by client other/,
		);
	});
});

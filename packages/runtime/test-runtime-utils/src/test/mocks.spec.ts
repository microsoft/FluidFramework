/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";

import { MockHandle } from "../mockHandle.js";
import { MockContainerRuntimeFactory, MockFluidDataStoreRuntime } from "../mocks.js";

describe("MockContainerRuntime", () => {
	it("inherits its id from the datastore when set", () => {
		const id = "example test id";
		const factory = new MockContainerRuntimeFactory();
		const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: id });
		const containerRuntime = factory.createContainerRuntime(dataStoreRuntime);
		assert.equal(containerRuntime.clientId, id);
	});

	it("generates and finalizes IdCreationRanges when generating an op", () => {
		const firstIdCompressor = createIdCompressor();
		const secondIdCompressor = createIdCompressor();
		const factory = new MockContainerRuntimeFactory();
		const firstDataStoreRuntime = new MockFluidDataStoreRuntime({
			idCompressor: firstIdCompressor,
		});
		const secondDataStoreRuntime = new MockFluidDataStoreRuntime({
			idCompressor: secondIdCompressor,
		});

		const firstContainerRuntime = factory.createContainerRuntime(firstDataStoreRuntime);
		const secondContainerRuntime = factory.createContainerRuntime(secondDataStoreRuntime);
		// Generate an ID in the first client
		const id = firstIdCompressor.generateCompressedId();
		const opSpaceId = firstIdCompressor.normalizeToOpSpace(id);

		// Generate an ID in the first client
		const secondId = secondIdCompressor.generateCompressedId();
		const secondOpSpaceId = secondIdCompressor.normalizeToOpSpace(secondId);

		// Generate a "dummy" op to trigger IdAllocationOp
		firstContainerRuntime.submit({}, undefined);
		secondContainerRuntime.submit({}, undefined);

		factory.processAllMessages();

		const normalizedId = secondDataStoreRuntime.idCompressor?.normalizeToSessionSpace(
			opSpaceId,
			firstIdCompressor.localSessionId,
		);

		const secondNormalizedId = firstDataStoreRuntime.idCompressor?.normalizeToSessionSpace(
			secondOpSpaceId,
			secondIdCompressor.localSessionId,
		);

		assert.strictEqual(normalizedId, 0, "Should have finalized the ID in both containers.");
		assert.strictEqual(
			secondNormalizedId,
			513,
			"Should have finalized the ID in both containers.",
		);
	});

	it("MockHandle is handle", () => {
		assert(isFluidHandle(new MockHandle(5)));
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "events";

import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";

import { waitForContainerCatchUpOrDispose } from "../loadTestDataStore.js";

class MockDeltaManager extends EventEmitter {
	public constructor(
		public lastSequenceNumber: number,
		public lastKnownSeqNumber: number,
	) {
		super();
	}
}

class MockRuntime extends EventEmitter {
	public connected = true;
	public disposed = false;

	public constructor(public readonly deltaManager: MockDeltaManager) {
		super();
	}
}

describe("LoadTestDataStoreModel", () => {
	it("waitForContainerCatchUpOrDispose resolves when already caught up", async () => {
		const deltaManager = new MockDeltaManager(1, 1);
		const runtime = new MockRuntime(deltaManager);

		let timeout: NodeJS.Timeout | undefined;
		const timeoutPromise = new Promise<never>((_resolve, reject) => {
			timeout = setTimeout(() => reject(new Error("Timed out waiting for catch-up")), 100);
		});

		try {
			await Promise.race([
				waitForContainerCatchUpOrDispose(runtime as unknown as IFluidDataStoreRuntime),
				timeoutPromise,
			]);
		} finally {
			assert(timeout !== undefined);
			clearTimeout(timeout);
		}
	});
});

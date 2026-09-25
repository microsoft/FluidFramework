/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createSeedRuntimeSnapshot,
	type SeedRuntimeSnapshot,
} from "@fluidframework/container-loader/legacy/alpha";

import { loadTextRuntime } from "./textContainerRuntime.js";
import { codeDetails, parseSeed } from "./textSeedFormat.js";

/**
 * Convert validated application data using a real, disconnected application runtime.
 * Fluid owns serialization of the complete runtime, data stores, compressor, and SharedTree.
 */
export async function materializeSeed(
	input: unknown,
	sequenceNumber: number,
): Promise<SeedRuntimeSnapshot> {
	if (sequenceNumber !== 0) {
		throw new Error("Only the original creation checkpoint can be materialized");
	}
	const seed = parseSeed(input);
	return createSeedRuntimeSnapshot({
		codeDetails,
		runtimeFactory: {
			get IRuntimeFactory() {
				return this;
			},
			async instantiateRuntime(context, existing) {
				const { runtime } = await loadTextRuntime(context, existing, { seed });
				return runtime;
			},
		},
	});
}

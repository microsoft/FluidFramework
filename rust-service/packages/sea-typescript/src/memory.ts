/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createBoundMemoryService, initialize } from "./bindings.js";
import type { SeaMemoryBundleOptions, SeaMemoryService } from "./index.js";

/** Creates an independent memory service using a lazily initialized package-owned bundle.
 * @internal
 */
export async function createMemoryService(
	options: SeaMemoryBundleOptions = {},
): Promise<SeaMemoryService> {
	const configuration = options.configuration ?? "memory";
	const node = options.environment === "node";
	const key = `${configuration}/${node ? "node" : "web"}`;
	const bindings = node
		? await initialize(
				key,
				() =>
					configuration === "memory"
						? import("../generated/memory/node/sea_wasm.js")
						: import("../generated/memory-compression/node/sea_wasm.js"),
				async () => {},
			)
		: await initialize(
				key,
				() =>
					configuration === "memory"
						? import("../generated/memory/web/sea_wasm.js")
						: import("../generated/memory-compression/web/sea_wasm.js"),
				(module) => module.default(),
			);
	return createBoundMemoryService(bindings);
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { initialize, makeOptions, wrapSession } from "./bindings.js";
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
	const service = new bindings.SeaMemoryService();
	let closed = false;
	let pendingOpens = 0;
	let released = false;
	const release = (): void => {
		if (closed && pendingOpens === 0 && !released) {
			released = true;
			service.free();
		}
	};
	return {
		async open(document, sessionOptions) {
			if (closed) {
				throw Object.assign(new Error("memory service is closed"), { kind: "Closed" });
			}
			const generatedOptions = makeOptions(bindings, sessionOptions);
			pendingOpens += 1;
			try {
				return wrapSession(await service.open(document, generatedOptions), bindings);
			} finally {
				generatedOptions.free();
				pendingOpens -= 1;
				release();
			}
		},
		close() {
			if (!closed) {
				closed = true;
				release();
			}
		},
	};
}

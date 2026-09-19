/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { initialize, makeOptions, wrapSession } from "./bindings.js";
import type { SeaSession, SeaSessionOptions } from "./index.js";

/** Endpoint and package-owned capability selection for browser WebTransport.
 * @internal
 */
export interface SeaWebTransportOptions {
	/** Reachable real WebTransport endpoint. */
	readonly url: string;
	/** SHA-256 digest of the development certificate. */
	readonly certificateHash: Uint8Array;
	/** Artifact capability selection, separate from session compression. */
	readonly configuration?: "webtransport" | "webtransport-compression";
}

/** Opens a real browser WebTransport session with no transport fallback.
 * @internal
 */
export async function openWebTransport(
	service: SeaWebTransportOptions,
	document: Uint8Array | undefined,
	options: SeaSessionOptions,
): Promise<SeaSession> {
	const configuration = service.configuration ?? "webtransport";
	const bindings = await initialize(
		`${configuration}/web`,
		() =>
			configuration === "webtransport"
				? import("../generated/webtransport/web/sea_wasm.js")
				: import("../generated/webtransport-compression/web/sea_wasm.js"),
		(module) => module.default(),
	);
	const generatedOptions = makeOptions(bindings, options);
	try {
		return wrapSession(
			await bindings.openWebTransport(
				service.url,
				service.certificateHash,
				document,
				generatedOptions,
			),
			bindings,
		);
	} finally {
		generatedOptions.free();
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { initialize, makeOptions, wrapSession } from "./bindings.js";
import type { SeaSession, SeaSessionOptions } from "./index.js";

/** Explicit initial transport policy; existing WebTransport factories never fall back.
 * @internal
 */
export interface SeaRemoteOptions {
	/** Generated JavaScript target; defaults to browser. Node uses its built-in WebSocket. */
	readonly environment?: "browser" | "node";
	/** Fixed policy; ordinary WebSocket sacrifices receive backpressure for compatibility. */
	readonly mode:
		| "WebTransport"
		| "WebSocketStream"
		| "PreferWebTransport"
		| "WebSocket"
		| "PreferAvailable";
	/** Separately trusted WebSocket endpoint, required for every mode except WebTransport. */
	readonly websocketUrl?: string;
	/** QUIC endpoint, required for modes that attempt WebTransport. */
	readonly url?: string;
	/** SHA-256 QUIC certificate pin; does not authenticate the WebSocket proxy. */
	readonly certificateHash?: Uint8Array;
	/** Positive per-attempt deadline, defaulting to 5000 milliseconds. */
	readonly timeoutMilliseconds?: number;
}

/** Opens a neutral session using the separate optional socket-capable artifact.
 * Ordinary receive queues fail at 4 MiB or 256 messages per socket instead of applying backpressure.
 * Selection occurs only before session operations; no replay or mid-session switching occurs.
 * @internal
 */
export async function openRemote(
	service: SeaRemoteOptions,
	document: Uint8Array | undefined,
	options: SeaSessionOptions,
): Promise<SeaSession> {
	const bindings =
		service.environment === "node"
			? await initialize(
					"websocket/node",
					() => import("../generated/websocket/node/sea_wasm.js"),
					async () => {},
				)
			: await initialize(
					"websocket/web",
					() => import("../generated/websocket/web/sea_wasm.js"),
					(module) => module.default(),
				);
	const mode = bindings.SeaBrowserTransportMode[service.mode];
	if (typeof mode !== "number") throw new Error("unsupported transport mode");
	const timeout = service.timeoutMilliseconds ?? 5000;
	if (!Number.isInteger(timeout) || timeout <= 0 || timeout > 0xffffffff)
		throw new Error("invalid transport timeout");
	const generatedOptions = makeOptions(bindings, options);
	try {
		return wrapSession(
			await bindings.openRemote(
				mode,
				service.url ?? "",
				service.certificateHash ?? new Uint8Array(),
				service.websocketUrl ?? "",
				timeout,
				document,
				generatedOptions,
			),
			bindings,
		);
	} finally {
		generatedOptions.free();
	}
}

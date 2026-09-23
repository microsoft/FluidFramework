/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createBoundMemoryService, initialize, openBoundWebTransport } from "./bindings.js";
import type { SeaMemoryService, SeaSession, SeaSessionOptions } from "./index.js";
import { createMemoryService } from "./memory.js";
import { openWebTransport, type SeaWebTransportOptions } from "./webtransport.js";

/** Artifact packaging, independent of service and session behavior.
 * @internal
 */
export type SeaLoaderPreset = "split" | "combined";

/** Capabilities and initialization target selected at the application composition point.
 * @internal
 */
export interface SeaLoaderOptions {
	/** Defaults to split artifacts, loaded only when their capability is used. */
	readonly preset?: SeaLoaderPreset;
	/** Includes compression support without enabling it on individual sessions. */
	readonly compressionSupport?: boolean;
	/** Defaults to browser. Node supports memory services, not browser WebTransport. */
	readonly environment?: "browser" | "node";
}

/** Neutral factories whose service arguments do not expose generated artifact selection.
 * @internal
 */
export interface SeaFactories {
	/** Creates independent storage; share this returned service explicitly between clients. */
	createMemoryService(): Promise<SeaMemoryService>;
	/** Opens the requested WebTransport endpoint without fallback or automatic retry. */
	openWebTransport(
		service: Omit<SeaWebTransportOptions, "configuration">,
		document: Uint8Array | undefined,
		options: SeaSessionOptions,
	): Promise<SeaSession>;
}

/** Selects lazy package-owned loaders without initializing WASM or creating storage.
 * @internal
 */
export function createSeaFactories(options: SeaLoaderOptions = {}): SeaFactories {
	const preset = options.preset ?? "split";
	const environment = options.environment ?? "browser";
	const compression = options.compressionSupport ?? false;
	if (
		(preset !== "split" && preset !== "combined") ||
		(environment !== "node" && environment !== "browser")
	) {
		throw Object.assign(new Error("unsupported SEA loader preset or environment"), {
			kind: "Rejected",
		});
	}
	const combined = async () => {
		const configuration = compression ? "combined-compression" : "combined";
		const key = `${configuration}/${environment === "node" ? "node" : "web"}`;
		return environment === "node"
			? initialize(
					key,
					() =>
						compression
							? import("../generated/combined-compression/node/sea_wasm.js")
							: import("../generated/combined/node/sea_wasm.js"),
					async () => {},
				)
			: initialize(
					key,
					() =>
						compression
							? import("../generated/combined-compression/web/sea_wasm.js")
							: import("../generated/combined/web/sea_wasm.js"),
					(module) => module.default(),
				);
	};
	return {
		async createMemoryService() {
			return preset === "split"
				? createMemoryService({
						environment,
						configuration: compression ? "memory-compression" : "memory",
					})
				: createBoundMemoryService(await combined());
		},
		async openWebTransport(service, document, sessionOptions) {
			if (environment === "node") {
				throw Object.assign(new Error("WebTransport requires a supported browser"), {
					kind: "Unavailable",
				});
			}
			return preset === "split"
				? openWebTransport(
						{
							...service,
							configuration: compression ? "webtransport-compression" : "webtransport",
						},
						document,
						sessionOptions,
					)
				: openBoundWebTransport(await combined(), service, document, sessionOptions);
		},
	};
}

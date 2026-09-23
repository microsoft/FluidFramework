/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import-x/no-internal-modules -- SEA integration APIs are internal. */
import type {
	ServiceClient,
	ServiceOptions,
} from "@fluidframework/driver-definitions/internal";
import { createSeaServiceClient } from "@fluidframework/sea-driver/internal";
import type { SeaMemoryService } from "@fluidframework/sea-typescript/internal";
/* eslint-enable import-x/no-internal-modules -- Limit the exception to SEA integration. */

/** Build-time packaging selection supplied by exampleAppConfig; unbundled consumers default to split. */
declare const __SEA_LOADER_PRESET__: "split" | "combined" | undefined;

/**
 * Constructs a lazy SEA client without changing the synchronous example helper contract.
 * @internal
 */
export function createSeaExampleServiceClient(
	service: "sea-ephemeral" | "sea-webtransport" | "sea-websocket",
	options: ServiceOptions,
	parameters: URLSearchParams,
): ServiceClient {
	const preset =
		// eslint-disable-next-line unicorn/no-typeof-undefined -- The build-time constant may be undeclared in unbundled consumers.
		typeof __SEA_LOADER_PRESET__ === "undefined" ? "split" : __SEA_LOADER_PRESET__;
	const compressionValue = parameters.get("seaCompression");
	if (
		compressionValue !== null &&
		compressionValue !== "true" &&
		compressionValue !== "false"
	) {
		throw new Error("seaCompression must be true or false");
	}
	const compression = compressionValue === "true";
	const websocketUrl =
		service === "sea-websocket" ? (parameters.get("seaEndpoint") ?? undefined) : undefined;
	if (service === "sea-websocket") {
		if (websocketUrl === undefined || new URL(websocketUrl).protocol !== "wss:") {
			throw new Error("SEA WebSocket requires a WSS seaEndpoint");
		}
		if (compression) {
			throw new Error("SEA WebSocket does not support seaCompression=true");
		}
	}
	let endpoint: { url: string; certificateHash: Uint8Array } | undefined;
	if (service === "sea-webtransport") {
		const url = parameters.get("seaEndpoint");
		const hash = parameters.get("seaCertificateHash")?.replace(/:/gu, "");
		if (
			url === null ||
			new URL(url).protocol !== "https:" ||
			hash === undefined ||
			!/^[0-9a-f]{64}$/iu.test(hash)
		) {
			throw new Error(
				"SEA WebTransport requires an HTTPS seaEndpoint and a SHA-256 seaCertificateHash",
			);
		}
		endpoint = {
			url,
			certificateHash: Uint8Array.from(hash.match(/../gu) ?? [], (byte) =>
				Number.parseInt(byte, 16),
			),
		};
	}
	const remote = endpoint;
	let memory: Promise<SeaMemoryService> | undefined;
	return createSeaServiceClient({
		oldestSupportedClient: options.oldestSupportedClient,
		openSession: async (document, sessionOptions) => {
			if (websocketUrl !== undefined) {
				const { openRemote } = await import(
					// eslint-disable-next-line import-x/no-internal-modules -- SEA socket bindings are internal.
					"@fluidframework/sea-typescript/internal/websocket"
				);
				return openRemote({ mode: "WebSocket", websocketUrl }, document, sessionOptions);
			}
			const { createSeaFactories } = await import(
				// eslint-disable-next-line import-x/no-internal-modules -- SEA loader presets are internal.
				"@fluidframework/sea-typescript/internal/presets"
			);
			const factories = createSeaFactories({ preset, compressionSupport: compression });
			const configuredOptions = { ...sessionOptions, compression };
			if (remote !== undefined) {
				return factories.openWebTransport(remote, document, configuredOptions);
			}
			memory ??= factories.createMemoryService();
			const memoryService = await memory;
			return memoryService.open(document, configuredOptions);
		},
	});
}

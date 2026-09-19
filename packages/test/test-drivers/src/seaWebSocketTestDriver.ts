/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITestDriver } from "@fluid-internal/test-driver-definitions";
import type { IRequest } from "@fluidframework/core-interfaces";
import type {
	IDocumentServiceFactory,
	IResolvedUrl,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import { SeaDriver, SeaSessionDriverClient } from "@fluidframework/sea-driver/internal";
import { openRemote } from "@fluidframework/sea-typescript/internal/websocket";

import { pkgVersion } from "./packageVersion.js";

/**
 * Current-version Fluid test adapter for a separately owned loopback SEA service.
 * @internal
 */
export class SeaWebSocketTestDriver implements ITestDriver {
	/** Explicit transport selection, never a fallback to another Fluid service. */
	public readonly type = "sea-websocket";
	/** The current workspace driver version. */
	public readonly version = pkgVersion;
	/** Clients retained until suite disposal, including storage-only clients. */
	private readonly clients = new Set<SeaSessionDriverClient>();
	/** Prevents creating or opening sessions after suite cleanup. */
	private disposed = false;
	/** The test-owned service endpoint, not a document URL. */
	private readonly endpoint: string;

	/** Validates the direct loopback endpoint before any WASM or session initialization. */
	public constructor(endpoint: string) {
		const url = new URL(endpoint);
		if (
			url.protocol !== "ws:" ||
			url.hostname !== "127.0.0.1" ||
			url.pathname !== "/sea/websocket" ||
			url.username !== "" ||
			url.password !== "" ||
			url.search !== "" ||
			url.hash !== ""
		) {
			throw new Error(
				"SEA tests require ws://127.0.0.1:<port>/sea/websocket without credentials or query parameters",
			);
		}
		this.endpoint = url.href;
	}

	/** Creates a Fluid factory with fresh SEA membership for each logical client. */
	public createDocumentServiceFactory(): IDocumentServiceFactory {
		return new SeaDriver(async () => {
			this.checkOpen();
			const client = new SeaSessionDriverClient(async (document, options) => {
				this.checkOpen();
				const session = await openRemote(
					{
						environment: "node",
						mode: "WebSocket",
						websocketUrl: this.endpoint,
					},
					document,
					options,
				);
				if (this.disposed) {
					await session.close();
					throw new Error("SEA test driver is disposed");
				}
				return session;
			}, "clientSelected");
			this.clients.add(client);
			return client;
		});
	}

	/** Resolves logical test URLs independently of the transport endpoint. */
	public createUrlResolver(): IUrlResolver {
		return {
			resolve: async (request: IRequest): Promise<IResolvedUrl> => {
				const url = new URL(request.url);
				const [, tenant, id] = url.pathname.split("/");
				if (
					url.protocol !== "fluid:" ||
					url.hostname !== "sea-test" ||
					tenant !== "tests" ||
					id === undefined ||
					id.length === 0
				) {
					throw new Error(`Invalid SEA test document URL: ${request.url}`);
				}
				return {
					type: "fluid",
					id: decodeURIComponent(id),
					url: url.href,
					tokens: {},
					endpoints: {},
				};
			},
			getAbsoluteUrl: async (resolved: IResolvedUrl, relative: string): Promise<string> =>
				`${resolved.url.replace(/\/$/u, "")}/${relative.replace(/^\//u, "")}`,
		};
	}

	/** Creates a stable request label; SEA assigns the actual identity during attachment. */
	public createCreateNewRequest(testId = "new"): IRequest {
		return { url: `fluid://sea-test/tests/${encodeURIComponent(testId)}` };
	}

	/** Reopens the returned SEA identity, including when the caller supplies its resolved URL. */
	public async createContainerUrl(
		testId: string,
		containerUrl?: IResolvedUrl,
	): Promise<string> {
		return `fluid://sea-test/tests/${encodeURIComponent(containerUrl?.id ?? testId)}`;
	}

	/** Cancels all client streams; the external runner awaits native service shutdown. */
	public dispose(): void {
		this.disposed = true;
		for (const client of this.clients) client.disconnect();
		this.clients.clear();
	}

	/** Rejects session construction after cleanup. */
	private checkOpen(): void {
		if (this.disposed) throw new Error("SEA test driver is disposed");
	}
}

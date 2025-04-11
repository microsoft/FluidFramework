/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions/internal";
import {
	LocalDocumentServiceFactory,
	LocalSessionStorageDbFactory,
} from "@fluidframework/local-driver/internal";
import { OdspDocumentServiceFactory } from "@fluidframework/odsp-driver/internal";
import {
	HostStoragePolicy,
	IPersistedCache,
} from "@fluidframework/odsp-driver-definitions/internal";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";

import { IDevServerUser, IRouterliciousRouteOptions, RouteOptions } from "./loader.js";

export const deltaConnectionServer = LocalDeltaConnectionServer.create(
	new LocalSessionStorageDbFactory(),
);

export function getDocumentServiceFactory(
	options: RouteOptions,
	odspPersistantCache?: IPersistedCache,
	odspHostStoragePolicy?: HostStoragePolicy,
): IDocumentServiceFactory {
	const userId = crypto.randomUUID();
	const match = userId.match(/^([\da-f]{8})-([\da-f]{4})/);
	const userName = match !== null ? match[0] : userId; // Just use the first two segments of the (fake) userId as a fake name.

	const getUser = (): IDevServerUser => ({
		id: userId,
		name: userName,
	});

	let routerliciousTokenProvider: InsecureTokenProvider;
	// tokenprovider and routerlicious document service will not be called for local and spo server.
	if (options.mode === "tinylicious") {
		routerliciousTokenProvider = new InsecureTokenProvider("12345", getUser());
	} else {
		const routerliciousRouteOptions = options as IRouterliciousRouteOptions;
		assert(
			routerliciousRouteOptions !== undefined,
			0x31d /* options are not of type "IRouterliciousRouteOptions" as expected */,
		);
		routerliciousTokenProvider = new InsecureTokenProvider(
			routerliciousRouteOptions.tenantSecret ?? "",
			getUser(),
		);
	}

	switch (options.mode) {
		case "docker":
		case "r11s":
		case "tinylicious":
			return new RouterliciousDocumentServiceFactory(routerliciousTokenProvider, {
				enableWholeSummaryUpload:
					options.mode === "r11s" || options.mode === "docker"
						? options.enableWholeSummaryUpload
						: undefined,
				enableDiscovery: options.mode === "r11s" && options.discoveryEndpoint !== undefined,
			});

		case "spo":
		case "spo-df":
			// TODO: web socket token
			return new OdspDocumentServiceFactory(
				async () => options.odspAccessToken ?? null,
				async () => options.pushAccessToken ?? null,
				odspPersistantCache,
				odspHostStoragePolicy,
			);

		default: // Local
			return new LocalDocumentServiceFactory(deltaConnectionServer);
	}
}

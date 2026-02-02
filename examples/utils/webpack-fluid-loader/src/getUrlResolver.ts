/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { InsecureUrlResolver } from "@fluidframework/driver-utils/internal";
import { LocalResolver } from "@fluidframework/local-driver/internal";

import { ITinyliciousRouteOptions, RouteOptions } from "./loader.js";
import { OdspUrlResolver } from "./odspUrlResolver.js";

const dockerUrls = {
	deltaStreamUrl: "http://localhost:3002",
	hostUrl: "http://localhost:3000",
	ordererUrl: "http://localhost:3003",
	storageUrl: "http://localhost:3001",
};

const defaultTinyliciousPort = 7070;

export const tinyliciousUrls = (
	options: ITinyliciousRouteOptions,
): {
	deltaStreamUrl: string;
	hostUrl: string;
	ordererUrl: string;
	storageUrl: string;
} => {
	const port = options.tinyliciousPort ?? defaultTinyliciousPort;

	// Creates an insecure Tinylicious URL resolver for testing purposes with localhost port 7070.
	// Detects the appropriate Tinylicious endpoint based on the environment.
	// In GitHub Codespaces, returns the forwarded port URL. Otherwise returns localhost.
	// If using codespaces, set tinylicious (port 7070) visibility to "public" for this to work.
	if (typeof window !== "undefined") {
		const match = /^(.+)-\d+\.(.+)$/.exec(window.location.hostname);
		if (match) {
			// Detect GitHub Codespaces and use the forwarded port URL
			// <codespace-name>-<fowarded-port>.<domain>
			// e.g. my-codespace-7070.githubpreview.dev
			// Capture Group 1: <codespace-name>
			// Capture Group 2: <domain>
			// reconstruct a hostname that fowards tinlicious's port via HTTPS.
			const url = `https://${match[1]}-${port}.${match[2]}`;
			return { deltaStreamUrl: url, hostUrl: url, ordererUrl: url, storageUrl: url };
		}
	}

	return {
		deltaStreamUrl: `http://localhost:${port}`,
		hostUrl: `http://localhost:${port}`,
		ordererUrl: `http://localhost:${port}`,
		storageUrl: `http://localhost:${port}`,
	};
};

export function getUrlResolver(
	options: RouteOptions,
): InsecureUrlResolver | OdspUrlResolver | LocalResolver {
	switch (options.mode) {
		case "docker":
			assert(options.tenantId !== undefined, 0x31e /* options.tenantId is undefined */);
			return new InsecureUrlResolver(
				dockerUrls.hostUrl,
				dockerUrls.ordererUrl,
				dockerUrls.storageUrl,
				dockerUrls.deltaStreamUrl,
				options.tenantId,
				options.bearerSecret ?? "",
			);

		case "r11s":
			assert(options.tenantId !== undefined, 0x320 /* options.tenantId is undefined */);
			assert(
				options.fluidHost !== undefined || options.discoveryEndpoint !== undefined,
				0x322 /* options.fluidHost and options.discoveryEndpoint are undefined */,
			);
			if (options.discoveryEndpoint !== undefined) {
				return new InsecureUrlResolver(
					"",
					options.discoveryEndpoint,
					"https://dummy-historian",
					"", // deltaStreamUrl
					options.tenantId,
					options.bearerSecret ?? "",
				);
			}

			const fluidHost = options.fluidHost ?? "";
			return new InsecureUrlResolver(
				fluidHost,
				fluidHost.replace("www", "alfred"),
				fluidHost.replace("www", "historian"),
				fluidHost.replace("www", "nexus"),
				options.tenantId,
				options.bearerSecret ?? "",
			);
		case "tinylicious": {
			const urls = tinyliciousUrls(options);
			return new InsecureUrlResolver(
				urls.hostUrl,
				urls.ordererUrl,
				urls.storageUrl,
				urls.deltaStreamUrl,
				"tinylicious",
				options.bearerSecret ?? "",
			);
		}
		case "spo":
		case "spo-df":
			assert(options.server !== undefined, 0x324 /* options.server is undefined */);
			assert(
				options.odspAccessToken !== undefined,
				0x325 /* options.odspAccessToken is undefined */,
			);
			return new OdspUrlResolver(options.server, { accessToken: options.odspAccessToken });

		default: // Local
			return new LocalResolver();
	}
}

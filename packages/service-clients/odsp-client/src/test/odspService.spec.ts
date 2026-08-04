/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { IResolvedUrl } from "@fluidframework/driver-definitions/internal";

import {
	getOdspContainerId,
	makeContainerLoaderOptions,
	type OdspServiceOptions,
} from "../odspService.js";

describe("ODSP service client", () => {
	it("forwards the configured logger to the loader", () => {
		const logger: ITelemetryBaseLogger = { send: () => {} };
		const options: OdspServiceOptions = {
			connection: {
				siteUrl: "https://example.sharepoint.com/site",
				driveId: "drive-id",
				filePath: "",
				tokenProvider: {
					fetchStorageToken: async () => ({ token: "storage-token" }),
					fetchWebsocketToken: async () => ({ token: "websocket-token" }),
				},
			},
			minVersionForCollaboration: "2.0.0",
			logger,
		};

		assert.equal(makeContainerLoaderOptions(options).logger, logger);
	});

	it("uses the ODSP item ID as the loadable container ID", () => {
		const resolvedUrl = {
			odspResolvedUrl: true,
			id: "hashed-document-id",
			itemId: "loadable-item-id",
		} as unknown as IResolvedUrl;

		assert.equal(getOdspContainerId(resolvedUrl), "loadable-item-id");
	});

	it("rejects a non-ODSP resolved URL", () => {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- The linter preferred syntax does not allow for unsafe type conversions, which is what we want here for minimal test data.
		const resolvedUrl = { id: "document-id" } as IResolvedUrl;

		assert.throws(() => getOdspContainerId(resolvedUrl), /ODSP resolved URL/);
	});
});

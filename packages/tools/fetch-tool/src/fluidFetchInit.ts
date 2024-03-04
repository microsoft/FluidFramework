/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { IClientConfig, IOdspAuthRequestInfo } from "@fluidframework/odsp-doclib-utils/internal";
import * as odsp from "@fluidframework/odsp-driver";
import {
	IOdspResolvedUrl,
	OdspResourceTokenFetchOptions,
} from "@fluidframework/odsp-driver-definitions";
import { FluidAppOdspUrlResolver, OdspUrlResolver } from "@fluidframework/odsp-urlresolver";
import * as r11s from "@fluidframework/routerlicious-driver";
import { RouterliciousUrlResolver } from "@fluidframework/routerlicious-urlresolver";
import { getMicrosoftConfiguration } from "@fluidframework/tool-utils";
import { localDataOnly, paramJWT } from "./fluidFetchArgs";
import { resolveWrapper } from "./fluidFetchSharePoint";

export let latestVersionsId: string = "";
export let connectionInfo: any;

async function initializeODSPCore(
	odspResolvedUrl: IOdspResolvedUrl,
	server: string,
	clientConfig: IClientConfig,
) {
	const { driveId, itemId } = odspResolvedUrl;

	connectionInfo = {
		server,
		drive: driveId,
		item: itemId,
	};

	if (localDataOnly) {
		return;
	}

	const docId = await odsp.getHashedDocumentId(driveId, itemId);

	console.log(`Connecting to ODSP:
  server: ${server}
  drive:  ${driveId}
  item:   ${itemId}
  docId:  ${docId}`);

	const getStorageTokenStub = async (options: OdspResourceTokenFetchOptions) => {
		return resolveWrapper(
			async (authRequestInfo: IOdspAuthRequestInfo) => {
				if (
					(options.refresh || !authRequestInfo.accessToken) &&
					authRequestInfo.refreshTokenFn
				) {
					return authRequestInfo.refreshTokenFn();
				}
				return authRequestInfo.accessToken;
			},
			server,
			clientConfig,
			undefined,
			true,
		);
	};
	// eslint-disable-next-line @typescript-eslint/promise-function-async
	const getWebsocketTokenStub = (_options: OdspResourceTokenFetchOptions) => Promise.resolve("");
	const odspDocumentServiceFactory = new odsp.OdspDocumentServiceFactory(
		getStorageTokenStub,
		getWebsocketTokenStub,
		undefined,
		{
			opsBatchSize: 20000,
			concurrentOpsBatches: 4,
		},
	);
	return odspDocumentServiceFactory.createDocumentService(odspResolvedUrl);
}

async function initializeR11s(server: string, pathname: string, r11sResolvedUrl: IResolvedUrl) {
	const path = pathname.split("/");
	let tenantId: string;
	let documentId: string;
	if (server === "localhost" && path.length < 4) {
		tenantId = "fluid";
		documentId = path[2];
	} else {
		tenantId = path[2];
		documentId = path[3];
	}

	// Latest version id is the documentId for r11s
	latestVersionsId = documentId;

	connectionInfo = {
		server,
		tenantId,
		id: documentId,
	};

	if (localDataOnly) {
		return;
	}

	console.log(`Connecting to r11s: tenantId=${tenantId} id:${documentId}`);
	const tokenProvider = new r11s.DefaultTokenProvider(paramJWT);
	const r11sDocumentServiceFactory = new r11s.RouterliciousDocumentServiceFactory(tokenProvider);
	return r11sDocumentServiceFactory.createDocumentService(r11sResolvedUrl);
}

interface IResolvedInfo {
	resolvedUrl: IResolvedUrl;
	serviceType: "odsp" | "r11s";
}
async function resolveUrl(url: string): Promise<IResolvedInfo | undefined> {
	const request: IRequest = { url };
	let maybeResolvedUrl: IResolvedUrl | undefined;

	// Try each url resolver in turn to figure out which one the request is compatible with.
	maybeResolvedUrl = await new OdspUrlResolver().resolve(request);
	if (maybeResolvedUrl !== undefined) {
		return {
			resolvedUrl: maybeResolvedUrl,
			serviceType: "odsp",
		};
	}

	maybeResolvedUrl = await new FluidAppOdspUrlResolver().resolve(request);
	if (maybeResolvedUrl !== undefined) {
		return {
			resolvedUrl: maybeResolvedUrl,
			serviceType: "odsp",
		};
	}

	maybeResolvedUrl = await new RouterliciousUrlResolver(
		undefined,
		async () => Promise.resolve(paramJWT),
		"",
	).resolve(request);
	if (maybeResolvedUrl !== undefined) {
		return {
			resolvedUrl: maybeResolvedUrl,
			serviceType: "r11s",
		};
	}

	return undefined;
}

export async function fluidFetchInit(urlStr: string) {
	const resolvedInfo = await resolveUrl(urlStr);
	if (resolvedInfo === undefined) {
		throw new Error(`Unknown URL ${urlStr}`);
	}
	const fluidResolvedUrl = resolvedInfo.resolvedUrl;
	if (resolvedInfo.serviceType === "odsp") {
		const odspResolvedUrl = fluidResolvedUrl as IOdspResolvedUrl;
		return initializeODSPCore(
			odspResolvedUrl,
			new URL(odspResolvedUrl.siteUrl).host,
			getMicrosoftConfiguration(),
		);
	} else if (resolvedInfo.serviceType === "r11s") {
		const url = new URL(urlStr);
		const server = url.hostname.toLowerCase();
		return initializeR11s(server, url.pathname, fluidResolvedUrl);
	}
}

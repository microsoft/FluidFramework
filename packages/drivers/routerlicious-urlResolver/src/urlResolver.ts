/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { IUser } from "@fluidframework/driver-definitions";
import { IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions/internal";

import { Provider } from "./nconf.cjs";

const r11sServers = [
	"www.wu2-ppe.prague.office-int.com",
	"www.wu2.prague.office-int.com",
	"www.eu.prague.office-int.com",
];

/**
 * @internal
 */
export class RouterliciousUrlResolver implements IUrlResolver {
	constructor(
		private readonly config:
			| { provider: Provider; tenantId: string; documentId: string }
			| undefined,
		private readonly getToken: () => Promise<string>,
		private readonly hostUrl: string,
	) {}

	/**
	 * Handles a request and returns the relevant endpoints for the environment
	 */
	public async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
		let requestedUrl = request.url;

		// If we know the original hostname, reinsert it
		if (this.config && request.url.startsWith("/")) {
			requestedUrl = `http://dummy:3000${request.url}`;
		}

		const reqUrl = new URL(requestedUrl);
		const server = reqUrl.hostname.toLowerCase();

		// If we don't have a valid server or a prescriptive config, we cannot resolve the URL
		if (
			!(
				r11sServers.includes(server) ||
				(server === "localhost" && reqUrl.port === "3000") ||
				this.config
			)
		) {
			return undefined;
		}

		const path = reqUrl.pathname.split("/");
		let tenantId: string;
		let documentId: string;
		let provider: Provider | undefined;
		if (this.config) {
			tenantId = this.config.tenantId;
			documentId = this.config.documentId;
			provider = this.config.provider;
		} else if (path.length >= 4) {
			tenantId = path[2];
			documentId = path[3];
		} else {
			tenantId = "fluid";
			documentId = path[2];
		}

		const token = await this.getToken();

		const isLocalHost = server === "localhost";
		const isInternalRequest = server.includes("gateway"); // e.g. gateway:3000 || fierce-dog-gateway:3000

		const serverSuffix = isLocalHost ? `${server}:3003` : server.substring(4);

		let fluidUrl =
			"https://" +
			`${
				this.config
					? new URL(this.config.provider.get("worker:serverUrl")).host
					: serverSuffix
			}/` +
			`${encodeURIComponent(tenantId)}/` +
			`${encodeURIComponent(documentId)}`;

		// In case of any additional parameters add them back to the url
		if (reqUrl.search) {
			const searchParams = reqUrl.search;
			if (searchParams) {
				fluidUrl += searchParams;
			}
		}

		let storageUrl = "";
		let ordererUrl = "";
		let deltaStorageUrl = "";

		// There is no provider when using debugging tooling
		if (provider && isInternalRequest) {
			storageUrl = provider.get("worker:internalBlobStorageUrl");
			ordererUrl = provider.get("worker:alfredUrl");
			deltaStorageUrl = `${provider.get("worker:alfredUrl")}/deltas/${encodeURIComponent(
				tenantId,
			)}/${encodeURIComponent(documentId)}`;
		} else if (provider) {
			storageUrl = provider
				.get("worker:blobStorageUrl")
				.replace("historian:3000", "localhost:3001");
			ordererUrl = provider.get("worker:serverUrl");
			deltaStorageUrl = `${ordererUrl}/deltas/${encodeURIComponent(
				tenantId,
			)}/${encodeURIComponent(documentId)}`;
		} else if (isLocalHost) {
			storageUrl = `http://localhost:3001`;
			ordererUrl = `http://localhost:3003`;
			deltaStorageUrl = `http://localhost:3003/deltas/${tenantId}/${documentId}`;
		} else {
			storageUrl = `https://historian.${serverSuffix}`;
			ordererUrl = `https://alfred.${serverSuffix}`;
			deltaStorageUrl = `https://alfred.${serverSuffix}/deltas/${tenantId}/${documentId}`;
		}

		storageUrl += `/repos/${tenantId}`;
		ordererUrl += ``;
		deltaStorageUrl += ``;

		const resolved: IResolvedUrl = {
			endpoints: {
				storageUrl,
				deltaStorageUrl,
				ordererUrl,
			},
			id: documentId,
			tokens: { jwt: token },
			type: "fluid",
			url: fluidUrl,
		};
		return resolved;
	}

	public async getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
		const parsedUrl = new URL(resolvedUrl.url);
		assert(!!parsedUrl.pathname, 0x0b9 /* "PathName should exist" */);
		const [, tenantId, documentId] = parsedUrl.pathname.split("/");
		assert(!!tenantId, 0x0ba /* "Tenant id should exist" */);
		assert(!!documentId, 0x0bb /* "Document id should exist" */);

		let url = relativeUrl;
		if (url.startsWith("/")) {
			url = url.substr(1);
		}

		return `${this.hostUrl}/${encodeURIComponent(tenantId)}/${encodeURIComponent(
			documentId,
		)}/${url}`;
	}
}

/**
 * @internal
 */
export interface IAlfredUser extends IUser {
	displayName: string;
	name: string;
}

/**
 * @internal
 */
export interface IConfig {
	serverUrl: string;
	blobStorageUrl: string;
	tenantId: string;
	documentId: string;
}

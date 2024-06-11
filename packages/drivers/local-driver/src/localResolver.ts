/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	DriverHeader,
	IResolvedUrl,
	IUrlResolver,
	ScopeType,
} from "@fluidframework/driver-definitions/internal";

import { generateToken } from "./auth.js";

/**
 * @alpha
 */
export function createLocalResolverCreateNewRequest(documentId: string): IRequest {
	const createNewRequest: IRequest = {
		url: `http://localhost:3000/${documentId}`,
		headers: {
			[DriverHeader.createNew]: true,
		},
	};
	return createNewRequest;
}

/**
 * Resolves URLs by providing fake URLs which succeed with the other
 * related local classes.
 * @alpha
 */
export class LocalResolver implements IUrlResolver {
	private readonly tenantId = "tenantId";
	private readonly tokenKey = "tokenKey";

	constructor() {}

	/**
	 * Resolves URL requests by providing fake URLs with an actually generated
	 * token from constant test strings. The root of the URL is fake, but the
	 * remaining relative URL can still be parsed.
	 * @param request - request to handle
	 */
	public async resolve(request: IRequest): Promise<IResolvedUrl> {
		const parsedUrl = new URL(request.url);
		const fullPath = `${parsedUrl.pathname.substr(1)}${parsedUrl.search}`;
		const documentId = fullPath.split("/")[0];
		const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
		const resolved: IResolvedUrl = {
			endpoints: {
				deltaStorageUrl: `http://localhost:3000/deltas/${this.tenantId}/${documentId}`,
				ordererUrl: "http://localhost:3000",
				storageUrl: `http://localhost:3000/repos/${this.tenantId}`,
			},
			id: documentId,
			tokens: { jwt: generateToken(this.tenantId, documentId, this.tokenKey, scopes) },
			type: "fluid",
			url: `https://localhost:3000/${this.tenantId}/${fullPath}`,
		};

		return resolved;
	}

	public async getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
		let url = relativeUrl;
		if (url.startsWith("/")) {
			url = url.substr(1);
		}
		const parsedUrl = new URL(resolvedUrl.url);
		if (parsedUrl.pathname === null) {
			throw new Error("Url should contain tenant and docId!!");
		}
		const [, , documentId] = parsedUrl.pathname.split("/");
		assert(!!documentId, 0x09a /* "'documentId' must be a defined, non-zero length string." */);

		return `http://localhost:3000/${documentId}/${url}`;
	}

	public createCreateNewRequest(documentId: string): IRequest {
		return createLocalResolverCreateNewRequest(documentId);
	}
}

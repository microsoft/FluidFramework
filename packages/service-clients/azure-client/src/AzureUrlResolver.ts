/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRequest } from "@fluidframework/core-interfaces";
import {
	DriverHeader,
	type IResolvedUrl,
	type IUrlResolver,
} from "@fluidframework/driver-definitions/internal";

/**
 * Implementation of {@link @fluidframework/driver-definitions#IUrlResolver} to resolve documents stored using the
 * Azure Fluid Relay based off of the orderer and storage URLs provide.
 *
 * @remarks The token provider here can be an `InsecureTokenProvider` for basic scenarios or more robust, secure
 * providers that fulfill the {@link @fluidframework/routerlicious-driver#ITokenProvider} interface.
 */
export class AzureUrlResolver implements IUrlResolver {
	public constructor() {}

	public async resolve(request: IRequest): Promise<IResolvedUrl> {
		const { ordererUrl, storageUrl, tenantId, containerId } = decodeAzureUrl(request.url);
		// determine whether the request is for creating of a new container.
		// such request has the `createNew` header set to true and doesn't have a container ID.
		if (request.headers && request.headers[DriverHeader.createNew] === true) {
			return {
				endpoints: {
					deltaStorageUrl: `${ordererUrl}/deltas/${tenantId}/new`,
					ordererUrl,
					storageUrl: `${storageUrl}/repos/${tenantId}`,
				},
				// id is a mandatory attribute, but it's ignored by the driver for new container requests.
				id: "",
				// tokens attribute is redundant as all tokens are generated via ITokenProvider
				tokens: {},
				type: "fluid",
				url: `${ordererUrl}/${tenantId}/new`,
			};
		}
		if (containerId === undefined) {
			throw new Error("Azure URL did not contain containerId");
		}
		const documentUrl = `${ordererUrl}/${tenantId}/${containerId}`;
		return {
			endpoints: {
				deltaStorageUrl: `${ordererUrl}/deltas/${tenantId}/${containerId}`,
				ordererUrl,
				storageUrl: `${storageUrl}/repos/${tenantId}`,
			},
			id: containerId,
			tokens: {},
			type: "fluid",
			url: documentUrl,
		};
	}

	public async getAbsoluteUrl(
		resolvedUrl: IResolvedUrl,
		relativeUrl: string,
	): Promise<string> {
		if (resolvedUrl.type !== "fluid") {
			throw new Error("Invalid Resolved Url");
		}
		return `${resolvedUrl.url}/${relativeUrl}`;
	}
}

function decodeAzureUrl(urlString: string): {
	ordererUrl: string;
	storageUrl: string;
	tenantId: string;
	containerId?: string;
} {
	const url = new URL(urlString);
	const ordererUrl = url.origin;
	const searchParameters = url.searchParams;
	const storageUrl = searchParameters.get("storage");
	if (storageUrl === null) {
		throw new Error("Azure URL did not contain a storage URL");
	}
	const tenantId = searchParameters.get("tenantId");
	if (tenantId === null) {
		throw new Error("Azure URL did not contain a tenant ID");
	}
	const storageUrlDecoded = decodeURIComponent(storageUrl);
	const tenantIdDecoded = decodeURIComponent(tenantId);
	const containerId = searchParameters.get("containerId");
	const containerIdDecoded =
		containerId === null ? undefined : decodeURIComponent(containerId);
	return {
		ordererUrl,
		storageUrl: storageUrlDecoded,
		tenantId: tenantIdDecoded,
		containerId: containerIdDecoded,
	};
}

/**
 * Creates a request object that can be passed to {@link @fluidframework/fluid-static#IFluidContainer.attach} to
 * request creation of a new Fluid Container on the Azure service.
 *
 * @param endpointUrl - URI to the Azure Fluid Relay service discovery endpoint.
 * @param tenantId - Unique tenant identifier.
 */
export const createAzureCreateNewRequest = (
	endpointUrl: string,
	tenantId: string,
): IRequest => {
	const url = new URL(endpointUrl);
	url.searchParams.append("storage", encodeURIComponent(endpointUrl));
	url.searchParams.append("tenantId", encodeURIComponent(tenantId));
	return {
		url: url.href,
		headers: {
			[DriverHeader.createNew]: true,
		},
	};
};

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRequest } from "@fluidframework/core-interfaces";
import { DriverHeader, IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";

/**
 * Implementation of {@link @fluidframework/driver-definitions#IUrlResolver} to resolve documents stored using the
 * Azure Fluid Relay based off of the orderer and storage URLs provide.
 *
 * @public
 * @remarks The token provider here can be an `InsecureTokenProvider` for basic scenarios or more robust, secure
 * providers that fulfill the {@link @fluidframework/routerlicious-driver#ITokenProvider} interface.
 *
 * @example
 * ```typescript
 * const azureUrlResolver = new AzureUrlResolver();
 * const resolvedUrl = await azureUrlResolver.resolve(request);
 * ```
 */
export class AzureUrlResolver implements IUrlResolver {
	/**
	 * Initializes a new instance of AzureUrlResolver.
	 * @public
	 */
	public constructor() {}

	/**
	 * Resolves the given Fluid request to an IResolvedUrl.
	 *
	 * @public
	 * @param request - Fluid request object.
	 * @returns Promise that resolves to an IResolvedUrl object.
	 * @throws Will throw an error if the containerId is not found in the Azure URL.
	 *
	 * @example
	 * ```typescript
	 * const resolvedUrl = await azureUrlResolver.resolve(request);
	 * ```
	 */
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

	/**
	 * Constructs an absolute URL from a resolved URL and a relative URL.
	 *
	 * @public
	 * @param resolvedUrl - Resolved Fluid URL.
	 * @param relativeUrl - Relative Fluid URL.
	 * @returns Promise that resolves to an absolute Fluid URL.
	 * @throws Will throw an error if the resolved URL type is invalid.
	 *
	 * @example
	 * ```typescript
	 * const absoluteUrl = await azureUrlResolver.getAbsoluteUrl(resolvedUrl, relativeUrl);
	 * ```
	 */
	public async getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
		if (resolvedUrl.type !== "fluid") {
			throw new Error("Invalid Resolved Url");
		}
		return `${resolvedUrl.url}/${relativeUrl}`;
	}
}

/**
 * Decodes an Azure Fluid URL into its constituent components.
 *
 * @internal
 * @param urlString - The Azure Fluid URL string.
 * @returns An object containing the ordererUrl, storageUrl, tenantId, and optionally, the containerId.
 * @throws Will throw an error if the URL does not contain a storage URL.
 * @throws Will throw an error if the URL does not contain a tenant ID.
 */
function decodeAzureUrl(urlString: string): {
	ordererUrl: string;
	storageUrl: string;
	tenantId: string;
	containerId?: string;
} {
	const url = new URL(urlString);
	const ordererUrl = url.origin;
	const searchParams = url.searchParams;
	const storageUrl = searchParams.get("storage");
	if (storageUrl === null) {
		throw new Error("Azure URL did not contain a storage URL");
	}
	const tenantId = searchParams.get("tenantId");
	if (tenantId === null) {
		throw new Error("Azure URL did not contain a tenant ID");
	}
	const storageUrlDecoded = decodeURIComponent(storageUrl);
	const tenantIdDecoded = decodeURIComponent(tenantId);
	const containerId = searchParams.get("containerId");
	const containerIdDecoded = containerId !== null ? decodeURIComponent(containerId) : undefined;
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
 * @returns IRequest object that can be passed to IFluidContainer.attach.
 *
 * @example
 * ```typescript
 * const request = createAzureCreateNewRequest(endpointUrl, tenantId);
 * ```
 */
export const createAzureCreateNewRequest = (endpointUrl: string, tenantId: string): IRequest => {
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

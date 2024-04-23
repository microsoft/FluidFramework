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

import type { RouterliciousConnectionConfig } from "./interfaces.js";

/**
 * RouterliciousUrlResolver resolves the URL for Routerlicious service.
 * @public
 */
export class RouterliciousUrlResolver implements IUrlResolver {
	public constructor(protected readonly props: RouterliciousConnectionConfig) {}

	public async resolve(request: IRequest): Promise<IResolvedUrl> {
		const containerId = request.url.split("/")[0];
		const { orderer: ordererUrl, storage: storageUrl, tenantId } = this.props;
		// determine whether the request is for creating of a new container.
		// such request has the `createNew` header set to true and doesn't have a container ID.
		if (request.headers && request.headers[DriverHeader.createNew] === true) {
			return {
				/*
                    TODO: review discovery logic in routerlicious-driver/src/urlUtils.ts
                    For some reason some endpoint urls are replaced and other just get updated host
                */
				endpoints: {
					// If enabledDiscovery = true, host will be updated.
					deltaStorageUrl: `${ordererUrl}/deltas/${tenantId}/new`,
					ordererUrl, // If enabledDiscovery = true, these will be replaces completely.
					storageUrl: `${storageUrl}/repos/${tenantId}`, // If enabledDiscovery = true, host will be updated.
				},
				// id is a mandatory attribute, but it's ignored by the driver for new container requests.
				id: "",
				// tokens attribute is redundant as all tokens are generated via ITokenProvider
				tokens: {},
				type: "fluid",
				url: `/${tenantId}/new`,
			};
		}
		if (containerId === undefined) {
			throw new Error("Routerlicious URL did not contain containerId");
		}
		const documentUrl = `/${tenantId}/${containerId}`;
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

	public async getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
		if (resolvedUrl.type !== "fluid") {
			throw new Error("Invalid Resolved Url");
		}
		return `${resolvedUrl.url}/${relativeUrl}`;
	}
}

/**
 * Creates a request object that can be passed to {@link @fluidframework/fluid-static#IFluidContainer.attach} to
 * request creation of a new Fluid Container on the Azure service.
 *
 * @param endpointUrl - URI to the Routerlicious service discovery endpoint.
 * @param tenantId - Unique tenant identifier.
 */
export const createRouterliciousCreateNewRequest = (documentId?: string): IRequest => ({
	url: documentId ?? "",
	headers: {
		[DriverHeader.createNew]: true,
	},
});

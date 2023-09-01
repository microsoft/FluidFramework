/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { DriverHeader, IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";

/**
 * Default endpoint port. Will be used by the service if the consumer does not specify a port.
 */
export const defaultTinyliciousPort = 7070;

/**
 * Default endpoint URL base. Will be used by the service if the consumer does not specify an endpoint.
 */
export const defaultTinyliciousEndpoint = "http://localhost";

/**
 * InsecureTinyliciousUrlResolver knows how to get the URLs to the service (in this case Tinylicious) to use
 * for a given request.  This particular implementation has a goal to avoid imposing requirements on the app's
 * URL shape, so it expects the request url to have this format (as opposed to a more traditional URL):
 * documentId/containerRelativePathing
 */
export class InsecureTinyliciousUrlResolver implements IUrlResolver {
	private readonly fluidProtocolEndpoint: string;
	private readonly tinyliciousEndpoint: string;
	public constructor(port = defaultTinyliciousPort, endpoint = defaultTinyliciousEndpoint) {
		this.tinyliciousEndpoint = `${endpoint}:${port}`;
		this.fluidProtocolEndpoint = this.tinyliciousEndpoint.replace(/(^\w+:|^)\/\//, "fluid://");
	}

	public async resolve(request: IRequest): Promise<IResolvedUrl> {
		const relativeUrl = request.url.replace(`${this.tinyliciousEndpoint}/`, "");
		const documentIdFromRequest = relativeUrl.split("/")[0];

		let deltaStorageUrl: string;
		let documentUrl: string;
		let finalDocumentId: string = documentIdFromRequest;

		// Special handling if the request is to create a new container
		if (request.headers && request.headers[DriverHeader.createNew] === true) {
			// Use the document ID passed by the application via the create request;
			// if none was passed, use the reserved keyword to let the driver generate the ID.
			// TODO: deprecate this capability for tinylicious as the r11s driver will stop using the document ID
			// in create requests.
			if (finalDocumentId === "") {
				finalDocumentId = "new";
			}
			deltaStorageUrl = `${this.tinyliciousEndpoint}/deltas/tinylicious/${finalDocumentId}`;
			documentUrl = `${this.fluidProtocolEndpoint}/tinylicious/${finalDocumentId}`;
		} else {
			const encodedDocId = encodeURIComponent(finalDocumentId);
			const documentRelativePath = relativeUrl.slice(documentIdFromRequest.length);
			documentUrl = `${this.fluidProtocolEndpoint}/tinylicious/${encodedDocId}${documentRelativePath}`;
			deltaStorageUrl = `${this.tinyliciousEndpoint}/deltas/tinylicious/${encodedDocId}`;
		}

		return {
			endpoints: {
				deltaStorageUrl,
				ordererUrl: this.tinyliciousEndpoint,
				storageUrl: `${this.tinyliciousEndpoint}/repos/tinylicious`,
			},
			id: finalDocumentId,
			tokens: {},
			type: "fluid",
			url: documentUrl,
		};
	}

	public async getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
		const documentId = decodeURIComponent(
			resolvedUrl.url.replace(`${this.fluidProtocolEndpoint}/tinylicious/`, ""),
		);
		/*
		 * The detached container flow will ultimately call getAbsoluteUrl() with the resolved.url produced by
		 * resolve().  The container expects getAbsoluteUrl's return value to be a URL that can then be roundtripped
		 * back through resolve() again, and get the same result again.  So we'll return a "URL" with the same format
		 * described above.
		 */
		return `${documentId}/${relativeUrl}`;
	}
}

export const createTinyliciousCreateNewRequest = (documentId?: string): IRequest => ({
	url: documentId ?? "",
	headers: {
		[DriverHeader.createNew]: true,
	},
});

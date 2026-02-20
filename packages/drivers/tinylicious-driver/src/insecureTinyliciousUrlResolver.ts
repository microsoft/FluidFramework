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
 * Default endpoint port. Will be used by the service if the consumer does not specify a port.
 * @internal
 */
export const defaultTinyliciousPort = 7070;

/**
 * Default endpoint URL base. Will be used by the service if the consumer does not specify an endpoint.
 * @internal
 */
export const defaultTinyliciousEndpoint = "http://localhost";

/**
 * InsecureTinyliciousUrlResolver knows how to get the URLs to the service (in this case Tinylicious) to use
 * for a given request.  This particular implementation has a goal to avoid imposing requirements on the app's
 * URL shape, so it expects the request url to have this format (as opposed to a more traditional URL):
 * documentId/containerRelativePathing
 * @internal
 */
export class InsecureTinyliciousUrlResolver implements IUrlResolver {
	private readonly tinyliciousEndpoint: string;
	public constructor(port = defaultTinyliciousPort, endpoint = defaultTinyliciousEndpoint) {
		this.tinyliciousEndpoint = `${endpoint}:${port}`;
	}

	public async resolve(request: IRequest): Promise<IResolvedUrl> {
		const relativeUrl = request.url.replace(`${this.tinyliciousEndpoint}/`, "");
		const documentIdFromRequest = relativeUrl.split("/")[0];

		let deltaStorageUrl: string;
		let documentUrl: string;
		let finalDocumentId: string = documentIdFromRequest;

		// Special handling if the request is to create a new container
		// eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- using ?. could change behavior
		if (request.headers && request.headers[DriverHeader.createNew] === true) {
			// Use the document ID passed by the application via the create request;
			// if none was passed, use the reserved keyword to let the driver generate the ID.
			// TODO: deprecate this capability for tinylicious as the r11s driver will stop using the document ID
			// in create requests.
			if (finalDocumentId === "") {
				finalDocumentId = "new";
			}
			deltaStorageUrl = `${this.tinyliciousEndpoint}/deltas/tinylicious/${finalDocumentId}`;
			documentUrl = `${this.tinyliciousEndpoint}/tinylicious/${finalDocumentId}`;
		} else {
			const encodedDocId = encodeURIComponent(finalDocumentId);
			const documentRelativePath = relativeUrl.slice(documentIdFromRequest.length);
			documentUrl = `${this.tinyliciousEndpoint}/tinylicious/${encodedDocId}${documentRelativePath}`;
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

	public async getAbsoluteUrl(
		resolvedUrl: IResolvedUrl,
		relativeUrl: string,
	): Promise<string> {
		const documentId = decodeURIComponent(
			resolvedUrl.url.replace(`${this.tinyliciousEndpoint}/tinylicious/`, ""),
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

/**
 * Creates an insecure Tinylicious URL resolver for testing purposes with localhost port 7070.
 * Detects the appropriate Tinylicious endpoint based on the environment.
 * @returns In GitHub Codespaces, returns the forwarded port URL. Otherwise returns localhost.
 * @remarks If using codespaces, set tinylicious (port 7070) visibility to "public" for this to work.
 */
function getTinyliciousEndpoint(): { endpoint: string; port: number } {
	if (typeof window !== "undefined") {
		// Detect GitHub Codespaces and use the forwarded port URL
		// <codespace-name>-<fowarded-port>.<domain>
		// e.g. my-codespace-7070.githubpreview.dev
		// Capture Group 1: <codespace-name>
		// Capture Group 2: <domain>
		// reconstruct a hostname that fowards tinlicious's port via HTTPS.
		const match = /^(.+)-\d+\.(.+)$/.exec(window.location.hostname);
		if (match) {
			// In Codespaces, the port is embedded in the hostname, use HTTPS port 443
			return {
				endpoint: `https://${match[1]}-${defaultTinyliciousPort}.${match[2]}`,
				port: 443,
			};
		}
	}
	return { endpoint: defaultTinyliciousEndpoint, port: defaultTinyliciousPort };
}

/**
 * Creates an insecure Tinylicious URL resolver for testing purposes.
 * Automatically detects GitHub Codespaces and uses the appropriate endpoint.
 */
export function createInsecureTinyliciousTestUrlResolver(): IUrlResolver {
	const { endpoint, port } = getTinyliciousEndpoint();
	return new InsecureTinyliciousUrlResolver(port, endpoint);
}

/**
 * Creates a Tinylicious {@link @fluidframework/core-interfaces#IRequest}.
 * @internal
 */
export const createTinyliciousCreateNewRequest = (documentId?: string): IRequest => ({
	url: documentId ?? "",
	headers: {
		[DriverHeader.createNew]: true,
	},
});

/**
 * Creates a Tinylicious {@link @fluidframework/core-interfaces#IRequest} for testing purposes.
 */
export const createTinyliciousTestCreateNewRequest = createTinyliciousCreateNewRequest;

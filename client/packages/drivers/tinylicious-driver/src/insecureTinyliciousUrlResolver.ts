/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import {
    DriverHeader,
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
} from "@fluidframework/driver-definitions";

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
    public constructor(
        port = defaultTinyliciousPort,
        endpoint = defaultTinyliciousEndpoint,
    ) {
        this.tinyliciousEndpoint = `${endpoint}:${port}`;
        this.fluidProtocolEndpoint = this.tinyliciousEndpoint.replace(/(^\w+:|^)\/\//, "fluid://");
    }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        // determine whether the request is for creating of a new container.
        // such request has the `createNew` header set to true and doesn't have a container ID.
        if (request.headers && request.headers[DriverHeader.createNew] === true) {
            // honor the document ID passed by the application via the create request
            // otherwise use the reserved keyword to let the driver generate the ID.
            // TODO: deprecate this capability for tinylicious as the r11s driver will stop using the document ID
            // in create requests.
            const newDocumentId = request.url ?? "new";
            return {
                endpoints: {
                    deltaStorageUrl: `${this.tinyliciousEndpoint}/deltas/tinylicious/${newDocumentId}`,
                    ordererUrl: this.tinyliciousEndpoint,
                    storageUrl: `${this.tinyliciousEndpoint}/repos/tinylicious`,
                },
                // id is a mandatory attribute, but it's ignored by the driver for new container requests.
                id: request.url,
                // tokens attribute is redundant as all tokens are generated via ITokenProvider
                tokens: {},
                type: "fluid",
                url: `${this.fluidProtocolEndpoint}/tinylicious/${newDocumentId}`,
            };
        }
        // for an existing container we'll parse the request URL to determine the document ID.
        const url = request.url.replace(`${this.tinyliciousEndpoint}/`, "");
        const documentId = url.split("/")[0];
        const encodedDocId = encodeURIComponent(documentId);
        const documentRelativePath = url.slice(documentId.length);

        const documentUrl =
            `${this.fluidProtocolEndpoint}/tinylicious/${encodedDocId}${documentRelativePath}`;
        const deltaStorageUrl =
            `${this.tinyliciousEndpoint}/deltas/tinylicious/${encodedDocId}`;
        const storageUrl =
            `${this.tinyliciousEndpoint}/repos/tinylicious`;

        const response: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl,
                ordererUrl: this.tinyliciousEndpoint,
                storageUrl,
            },
            id: documentId,
            tokens: {},
            type: "fluid",
            url: documentUrl,
        };
        return response;
    }

    public async getAbsoluteUrl(resolvedUrl: IFluidResolvedUrl, relativeUrl: string): Promise<string> {
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

export const createTinyliciousCreateNewRequest =
    (documentId?: string): IRequest => (
        {
            url: documentId ?? "",
            headers: {
                [DriverHeader.createNew]: true,
            },
        }
    );

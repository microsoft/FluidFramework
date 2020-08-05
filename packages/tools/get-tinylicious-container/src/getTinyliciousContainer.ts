/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/component-core-interfaces";
import {
    IRuntimeFactory, DetachedContainerSource,
} from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import {
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
} from "@fluidframework/driver-definitions";
import { ITokenClaims } from "@fluidframework/protocol-definitions";
import { RouterliciousDocumentServiceFactory, DefaultErrorTracking } from "@fluidframework/routerlicious-driver";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";

// URLResolver knows how to get the URLs to the service to use for a given request, in this case Tinylicious.
// In order to avoid imposing requirements on the app's URL shapes, we'll expect our requests to simply include the
// documentId for the URL (as opposed to a more traditional URL).
class InsecureTinyliciousUrlResolver implements IUrlResolver {
    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const documentId = request.url;
        const encodedDocId = encodeURIComponent(documentId);

        const documentUrl = `fluid://localhost:3000/tinylicious/${encodedDocId}`;
        const deltaStorageUrl = `http://localhost:3000/deltas/tinylicious/${encodedDocId}`;
        const storageUrl = `http://localhost:3000/repos/tinylicious`;

        const response: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl,
                ordererUrl: "http://localhost:3000",
                storageUrl,
            },
            tokens: { jwt: this.auth(documentId) },
            type: "fluid",
            url: documentUrl,
        };
        return response;
    }

    public async getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
        // Detached flow requires getAbsoluteUrl to return a string, though this is not really valid.
        return "";
    }

    private auth(documentId: string) {
        const claims: ITokenClaims = {
            documentId,
            scopes: ["doc:read", "doc:write", "summary:write"],
            tenantId: "tinylicious",
            user: { id: uuid() },
        };

        return jwt.sign(claims, "12345");
    }
}

/**
 * Connect to the Tinylicious service and retrieve a Container with the given ID running the given code.
 * @param documentId - The document id to retrieve or create
 * @param containerRuntimeFactory - The container factory to be loaded in the container
 */
export async function getTinyliciousContainer(
    documentId: string,
    containerRuntimeFactory: IRuntimeFactory,
    createNew: boolean,
): Promise<Container> {
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(
        false,
        new DefaultErrorTracking(),
        false,
        true,
        undefined,
    );

    const urlResolver = new InsecureTinyliciousUrlResolver();

    // To bypass proposal-based loading, we need a codeLoader that will return our already-in-memory container factory.
    // The expected format of that response is an IFluidModule with a fluidExport.
    const module = { fluidExport: containerRuntimeFactory };
    const codeLoader = { load: async () => module };

    const loader = new Loader(
        urlResolver,
        documentServiceFactory,
        codeLoader,
        { blockUpdateMarkers: true },
        {},
        new Map(),
    );

    let container: Container;

    if (createNew) {
        // We're not actually using the code proposal (our code loader always loads the same module regardless of the
        // proposal), but the Container will only give us a NullRuntime if there's no proposal.  So we'll use a fake
        // proposal.
        const source: DetachedContainerSource = {
            codeDetails: { package: "", config: {} },
            useSnapshot: false,
        };
        container = await loader.createDetachedContainer(source);
        await container.attach({ url: documentId });
    } else {
        // The InsecureTinyliciousUrlResolver expects the url of the request to be the documentId.
        container = await loader.resolve({ url: documentId });
        // If we didn't create the container properly, then it won't function correctly.  So we'll throw if we got a
        // new container here, where we expect this to be loading an existing container.
        if (!container.existing) {
            throw new Error("Attempted to load a non-existing container");
        }
    }

    return container;
}

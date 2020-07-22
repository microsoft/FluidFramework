/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { initializeContainerCode } from "@fluidframework/base-host";
import { IRequest } from "@fluidframework/component-core-interfaces";
import {
    IRuntimeFactory,
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
        throw new Error("getAbsoluteUrl not implemented");
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
 * Connect to the Tinylicious service and retrieve a Container, or if it does not already exist then create a new
 * Container and propose the given code.
 * @param documentId - The document id to retrieve or create
 * @param packageJson - The package that will be proposed as the code proposal
 * @param fluidModule - Optionally, seed the codeLoader with an in-memory entrypoint for that proposal
 */
export async function getTinyliciousContainer(
    documentId: string,
    containerRuntimeFactory: IRuntimeFactory,
): Promise<Container> {
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(
        false,
        new DefaultErrorTracking(),
        false,
        true,
        undefined,
    );

    const urlResolver = new InsecureTinyliciousUrlResolver();

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

    // The InsecureTinyliciousUrlResolver expects the url of the request to be the documentId.
    const container = await loader.resolve({ url: documentId });

    await initializeContainerCode(container, { package: "", config: {} });

    // If we're loading from ops, the context might be in the middle of reloading.  Check for that case and wait
    // for the contextChanged event to avoid returning before that reload completes.
    if (container.hasNullRuntime()) {
        await new Promise<void>((resolve) => container.once("contextChanged", () => resolve()));
    }

    return container;
}

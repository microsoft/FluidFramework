/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { initializeContainerCode } from "@fluidframework/base-host";
import { IRequest } from "@fluidframework/component-core-interfaces";
import {
    IFluidModule,
    IFluidPackage,
    IFluidCodeDetails,
    IFluidCodeResolver,
    IResolvedFluidCodeDetails,
    isFluidPackage,
} from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import {
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
} from "@fluidframework/driver-definitions";
import { ITokenClaims } from "@fluidframework/protocol-definitions";
import { RouterliciousDocumentServiceFactory, DefaultErrorTracking } from "@fluidframework/routerlicious-driver";
import { extractPackageIdentifierDetails, WebCodeLoader } from "@fluidframework/web-code-loader";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";

// URLResolver knows how to get the URLs to the service to use for a given request, in this case Tinylicious.
// Since we're passing the documentId in the constructor it can't be reused for multiple documents, but this way it
// doesn't impose any requirements on the URL shape of the request (e.g. if the documentId is not encoded in the URL).
class InsecureTinyliciousUrlResolver implements IUrlResolver {
    constructor(private readonly documentId: string) { }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const encodedDocId = encodeURIComponent(this.documentId);

        const documentUrl = `fluid://localhost:3000/tinylicious/${encodedDocId}`;
        const deltaStorageUrl = `http://localhost:3000/deltas/tinylicious/${encodedDocId}`;
        const storageUrl = `http://localhost:3000/repos/tinylicious`;

        const response: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl,
                ordererUrl: "http://localhost:3000",
                storageUrl,
            },
            tokens: { jwt: this.auth(this.documentId) },
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

// The code resolver's job is basically to take a list of relative URLs (embedded in the IFluidCodeDetails) and
// convert them to URLs that will find the correct scripts relative to the app (which is the context in which the code
// will be loaded).  So maybe the URLs can stay relative, or maybe they'll be converted to absolute URLs against a
// base URL (like a CDN or something).  In this case, we assume any relative URLs are hosted from the same server
// running the app, and as a result none of the relative URLs need to be converted.
class WebpackCodeResolver implements IFluidCodeResolver {
    async resolveCodeDetails(details: IFluidCodeDetails): Promise<IResolvedFluidCodeDetails> {
        if (typeof details.package === "string" || !isFluidPackage(details.package)) {
            throw new Error("Not a fluid package");
        }
        const parse = extractPackageIdentifierDetails(details.package);
        return {
            config: details.config,
            package: details.package,
            resolvedPackage: details.package,
            resolvedPackageCacheId: parse.fullId,
        };
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
    packageJson: IFluidPackage,
    fluidModule?: IFluidModule,
): Promise<Container> {
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(
        false,
        new DefaultErrorTracking(),
        false,
        true,
        undefined,
    );

    const urlResolver = new InsecureTinyliciousUrlResolver(documentId);

    const codeResolver = new WebpackCodeResolver();
    const codeLoader = new WebCodeLoader(codeResolver);

    const codeDetails: IFluidCodeDetails = {
        package: packageJson,
        config: {},
    };
    // Optionally, we can seed the codeLoader with a module we loaded ourselves.  If we don't seed, the codeLoader
    // is supposed to bring it in.
    if (fluidModule !== undefined) {
        await codeLoader.seedModule(codeDetails, fluidModule);
    }

    const loader = new Loader(
        urlResolver,
        documentServiceFactory,
        codeLoader,
        { blockUpdateMarkers: true },
        {},
        new Map(),
    );

    const url = window.location.href;
    const container = await loader.resolve({ url });

    await initializeContainerCode(container, codeDetails);

    // If we're loading from ops, the context might be in the middle of reloading.  Check for that case and wait
    // for the contextChanged event to avoid returning before that reload completes.
    if (container.hasNullRuntime()) {
        await new Promise<void>((resolve) => container.once("contextChanged", () => resolve()));
    }

    return container;
}

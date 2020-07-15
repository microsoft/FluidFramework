/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/component-core-interfaces";
import {
    IFluidModule,
    IFluidPackage,
    IFluidCodeDetails,
    IFluidCodeResolver,
    IResolvedFluidCodeDetails,
    isFluidPackage,
} from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import {
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
} from "@fluidframework/driver-definitions";
import { ITokenClaims } from "@fluidframework/protocol-definitions";
import { RouterliciousDocumentServiceFactory, DefaultErrorTracking } from "@fluidframework/routerlicious-driver";
import { extractPackageIdentifierDetails, WebCodeLoader } from "@fluidframework/web-code-loader";
import jwt from "jsonwebtoken";
// eslint-disable-next-line import/no-internal-modules
import uuid from "uuid/v4";
import { BaseHost } from "./host";

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
// convert them URLs that will find the correct scripts relative to the app (which is the context in which the code
// will be loaded).  So maybe the URLs can stay relative, or maybe they'll be converted to absolute URLs against a
// base URL (like a CDN or something).  In this case, we assume they're all hosted from the same server running
// the app, and as a result none of the relative URLs need to be converted.
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

    // Construct a request
    const urlResolver = new InsecureTinyliciousUrlResolver(documentId);

    const codeResolver = new WebpackCodeResolver();
    const codeLoader = new WebCodeLoader(codeResolver);

    const codeDetails: IFluidCodeDetails = {
        package: packageJson,
        config: {},
    };
    // Optionally, we could seed the codeLoader with a module we loaded ourselves.  I'm choosing not to here to verify
    // that dynamic code loading works as expected.
    // await codeLoader.seedModule(codeDetails, fluidModule);

    const baseHost = new BaseHost(
        urlResolver,
        documentServiceFactory,
        codeLoader,
    );

    return baseHost.initializeContainer(
        window.location.href,
        codeDetails,
    );
}

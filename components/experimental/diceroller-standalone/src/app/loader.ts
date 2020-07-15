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
import {
    ITokenClaims,
} from "@fluidframework/protocol-definitions";
import { RouterliciousDocumentServiceFactory, DefaultErrorTracking } from "@fluidframework/routerlicious-driver";
import { extractPackageIdentifierDetails, WebCodeLoader } from "@fluidframework/web-code-loader";
import jwt from "jsonwebtoken";
// eslint-disable-next-line import/no-internal-modules
import uuid from "uuid/v4";
import { BaseHost } from "./host";

class InsecureTinyliciousUrlResolver implements IUrlResolver {
    constructor(
        private readonly documentId: string,
    ) { }

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

// The code resolver's job is basically to take a list of relative URLs and convert them URLs that will find the
// correct scripts.  So maybe they can stay relative, or maybe they'll be converted to absolute URLs against a
// base URL (like a CDN or something)
class WebpackCodeResolver implements IFluidCodeResolver {
    constructor(private readonly port: number) { }
    async resolveCodeDetails(details: IFluidCodeDetails): Promise<IResolvedFluidCodeDetails> {
        const baseUrl = `http://localhost:${this.port}`;
        let pkg = details.package;
        if (typeof pkg === "string") {
            const resp = await fetch(`${baseUrl}/package.json`);
            pkg = await resp.json() as IFluidPackage;
        }
        if (!isFluidPackage(pkg)) {
            throw new Error("Not a fluid package");
        }
        const files = pkg.fluid.browser.umd.files;
        for (let i = 0; i < pkg.fluid.browser.umd.files.length; i++) {
            if (!files[i].startsWith("http")) {
                files[i] = `${baseUrl}/${files[i]}`;
            }
        }
        const parse = extractPackageIdentifierDetails(details.package);
        return {
            config: details.config,
            package: details.package,
            resolvedPackage: pkg,
            resolvedPackageCacheId: parse.fullId,
        };
    }
}

export async function getTinyliciousContainer(
    documentId: string,
    packageJson: IFluidPackage,
    fluidModule: IFluidModule,
    port: number,
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

    const codeResolver = new WebpackCodeResolver(port);
    const codeLoader = new WebCodeLoader(codeResolver);

    const codeDetails: IFluidCodeDetails = {
        package: packageJson,
        config: {},
    };
    // maybe don't seed?  then initializeContainer happens outside of this function in the app
    await codeLoader.seedModule(codeDetails, fluidModule);

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

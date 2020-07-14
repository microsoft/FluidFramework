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
    IUser,
} from "@fluidframework/protocol-definitions";
import { RouterliciousDocumentServiceFactory, DefaultErrorTracking } from "@fluidframework/routerlicious-driver";
import { extractPackageIdentifierDetails } from "@fluidframework/web-code-loader";
import jwt from "jsonwebtoken";
// eslint-disable-next-line import/no-internal-modules
import uuid from "uuid/v4";
import { BaseHost } from "./host";
import { IBaseHostConfig } from "./hostConfig";

class InsecureUrlResolver implements IUrlResolver {
    constructor(
        private readonly ordererUrl: string,
        private readonly storageUrl: string,
        private readonly tenantId: string,
        private readonly tenantKey: string,
        private readonly user: IUser,
        private readonly documentId: string,
    ) { }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const encodedTenantId = encodeURIComponent(this.tenantId);
        const encodedDocId = encodeURIComponent(this.documentId);

        const documentUrl = `fluid://${new URL(this.ordererUrl).host}/${encodedTenantId}/${encodedDocId}`;
        const deltaStorageUrl = `${this.ordererUrl}/deltas/${encodedTenantId}/${encodedDocId}`;
        const storageUrl = `${this.storageUrl}/repos/${encodedTenantId}`;

        const response: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl,
                ordererUrl: this.ordererUrl,
                storageUrl,
            },
            tokens: { jwt: this.auth(this.tenantId, this.documentId) },
            type: "fluid",
            url: documentUrl,
        };
        return response;
    }

    public async getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
        throw new Error("getAbsoluteUrl not implemented");
    }

    private auth(tenantId: string, documentId: string) {
        const claims: ITokenClaims = {
            documentId,
            scopes: ["doc:read", "doc:write", "summary:write"],
            tenantId,
            user: this.user,
        };

        return jwt.sign(claims, this.tenantKey);
    }
}

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
    const urlResolver = new InsecureUrlResolver(
        "http://localhost:3000", // ordererUrl
        "http://localhost:3000", // storageUrl
        "tinylicious", // tenantId
        "12345", // tenantKey
        { id: uuid() }, // user
        documentId,
    );

    const hostConf: IBaseHostConfig = {
        codeResolver: new WebpackCodeResolver(port),
        documentServiceFactory,
        urlResolver,
    };

    const codeDetails: IFluidCodeDetails = {
        package: packageJson,
        config: {},
    };
    const packageSeed: [IFluidCodeDetails, IFluidModule] =
        [codeDetails, fluidModule];

    const baseHost = new BaseHost(
        hostConf,
        [packageSeed],
    );

    return baseHost.initializeContainer(
        window.location.href,
        codeDetails,
    );
}

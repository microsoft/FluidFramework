/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseHost, IBaseHostConfig } from "@fluidframework/base-host";
import {
    IFluidModule,
    IFluidPackage,
    IFluidCodeDetails,
    IFluidCodeResolver,
    IResolvedFluidCodeDetails,
    isFluidPackage,
} from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IUser } from "@fluidframework/protocol-definitions";
import { RouterliciousDocumentServiceFactory, DefaultErrorTracking } from "@fluidframework/routerlicious-driver";
import { extractPackageIdentifierDetails } from "@fluidframework/web-code-loader";
import { getRandomName } from "@fluidframework/server-services-client";
// eslint-disable-next-line import/no-internal-modules
import uuid from "uuid/v4";
import { InsecureUrlResolver } from "./insecureUrlResolver";

export interface IDevServerUser extends IUser {
    name: string;
}

class WebpackCodeResolver implements IFluidCodeResolver {
    constructor(private readonly port: number) { }
    async resolveCodeDetails(details: IFluidCodeDetails): Promise<IResolvedFluidCodeDetails> {
        const baseUrl = details.config.cdn ?? `http://localhost:${this.port}`;
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

export async function start(
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
    const url = window.location.href;
    const urlResolver = new InsecureUrlResolver(
        "http://localhost:3000", // hostUrl
        "http://localhost:3000", // ordererUrl
        "http://localhost:3000", // storageUrl
        "tinylicious", // tenantId
        "12345", // tenantKey
        {
            id: uuid(),
            name: getRandomName(),
        } as IUser,
        "", // bearerSecret
        documentId,
    );

    const codeDetails: IFluidCodeDetails = {
        package: packageJson,
        config: {},
    };
    const packageSeed: [IFluidCodeDetails, IFluidModule] =
        [codeDetails, fluidModule];

    const hostConf: IBaseHostConfig =
        { codeResolver: new WebpackCodeResolver(port), documentServiceFactory, urlResolver };
    const baseHost = new BaseHost(
        hostConf,
        [packageSeed],
    );

    return await baseHost.initializeContainer(
        url,
        codeDetails,
    );
}

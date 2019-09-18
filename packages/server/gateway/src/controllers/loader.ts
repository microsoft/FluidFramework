/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IGitCache } from "@microsoft/fluid-server-services-client";
import { createWebLoader, IHostConfig, initializeChaincode, registerAttach } from "@prague/base-host";
import { IResolvedPackage } from "@prague/loader-web";
import { OdspDocumentServiceFactory } from "@prague/odsp-socket-storage";
import { IDocumentServiceFactory, IResolvedUrl } from "@prague/protocol-definitions";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import { TelemetryNullLogger } from "@prague/utils";
import { DocumentFactory } from "./documentFactory";
import { MicrosoftGraph } from "./graph";
import { PackageManager } from "./packageManager";
import { IHostServices } from "./services";

export async function initialize(
    url: string,
    resolved: IResolvedUrl,
    cache: IGitCache,
    pkg: IResolvedPackage,
    scriptIds: string[],
    npm: string,
    jwt: string,
    config: any,
    graphAccessToken: string,
) {
    const documentFactory = new DocumentFactory(config.tenantId);
    const graph = graphAccessToken ? new MicrosoftGraph(graphAccessToken) : undefined;
    const packageManager = new PackageManager(
        config.packageManager.endpoint,
        config.packageManager.username,
        config.packageManager.password);

    const services: IHostServices = {
        IDocumentFactory: documentFactory,
        IMicrosoftGraph: graph,
        IPackageManager: packageManager,
    };

    const documentServiceFactories: IDocumentServiceFactory[] = [];
    documentServiceFactories.push(new OdspDocumentServiceFactory(
        "Server-Gateway",
        (siteUrl: string) => Promise.resolve("fake token"),
        () => Promise.resolve("fake token"),
        new TelemetryNullLogger()));

    documentServiceFactories.push(new RouterliciousDocumentServiceFactory(
        false,
        new DefaultErrorTracking(),
        false,
        true,
        cache));

    const resolver = new ContainerUrlResolver(
        document.location.origin,
        jwt,
        new Map<string, IResolvedUrl>([[url, resolved]]));

    const hostConf: IHostConfig = { documentServiceFactory: documentServiceFactories, urlResolver: resolver };

    // Provide access to all loader services from command line for easier testing as we bring more up
    // tslint:disable-next-line
    window["allServices"] = services;

    console.log(`Loading ${url}`);
    const loader = createWebLoader(
        resolved,
        pkg,
        scriptIds,
        npm,
        config,
        services,
        hostConf);
    documentFactory.resolveLoader(loader);

    const div = document.getElementById("content") as HTMLDivElement;
    const container = await loader.resolve({ url });

    registerAttach(loader, container, url, div);

    // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
    // package.
    if (!container.existing) {
        await initializeChaincode(container, pkg);
    }
}

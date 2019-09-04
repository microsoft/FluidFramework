/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { createWebLoader, initializeChaincode, registerAttach } from "@prague/base-host";
import { IResolvedPackage } from "@prague/loader-web";
import { IResolvedUrl } from "@prague/protocol-definitions";
import { IGitCache } from "@prague/services-client";
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

    // Provide access to all loader services from command line for easier testing as we bring more up
    // tslint:disable-next-line
    window["allServices"] = services;

    console.log(`Loading ${url}`);
    const loader = createWebLoader(
        url,
        resolved,
        cache,
        pkg,
        scriptIds,
        npm,
        jwt,
        config,
        services);
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

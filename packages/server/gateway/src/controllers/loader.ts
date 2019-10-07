/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    createWebLoader,
    IHostConfig,
    initializeChaincode,
    registerAttach,
} from "@microsoft/fluid-base-host";
import { BaseTelemetryNullLogger } from "@microsoft/fluid-core-utils";
import { OdspDocumentServiceFactory } from "@microsoft/fluid-odsp-driver";
import { IDocumentServiceFactory, IFluidResolvedUrl } from "@microsoft/fluid-protocol-definitions";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";
import { ContainerUrlResolver } from "@microsoft/fluid-routerlicious-host";
import { IGitCache } from "@microsoft/fluid-server-services-client";
import { IResolvedPackage, WhiteList } from "@microsoft/fluid-web-code-loader";
import Axios from "axios";
import { DocumentFactory } from "./documentFactory";
import { MicrosoftGraph } from "./graph";
import { PackageManager } from "./packageManager";
import { IHostServices } from "./services";

class MailServices {
    constructor(private accessToken: string) {
    }

    // Create draft
    // https://docs.microsoft.com/en-us/graph/api/message-createreply?view=graph-rest-1.0&tabs=http

    public async mail(): Promise<any[]> {
        const me = await Axios.get(
            "https://graph.microsoft.com/v1.0/me/messages",
            {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                },
            });

        return me.data;
    }

    public async message(id: string): Promise<any> {
        const me = await Axios.get(
            `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(id)}`,
            {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                },
            });

        return me.data;
    }

    public async save(id: string, value: any): Promise<any> {
        const me = await Axios.patch(
            `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(id)}`,
            value,
            {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                },
            });

        return me.data;
    }

    public async drafts(): Promise<any[]> {
        const me = await Axios.get(
            "https://graph.microsoft.com/v1.0/me/mailFolders/Drafts/messages",
            {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                },
            });

        return me.data;
    }

    public async folders(): Promise<any[]> {
        const me = await Axios.get(
            "https://graph.microsoft.com/v1.0/me/mailFolders",
            {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                },
            });

        return me.data;
    }
}

export async function initialize(
    url: string,
    resolved: IFluidResolvedUrl,
    cache: IGitCache,
    pkg: IResolvedPackage,
    scriptIds: string[],
    npm: string,
    jwt: string,
    config: any,
    clientId: string,
    user: any,
) {
    const documentFactory = new DocumentFactory(config.tenantId);
    const graph = user.accessToken ? new MicrosoftGraph(user.accessToken) : undefined;
    const packageManager = new PackageManager(
        config.packageManager.endpoint,
        config.packageManager.username,
        config.packageManager.password);

    const services: IHostServices = {
        IDocumentFactory: documentFactory,
        IMicrosoftGraph: graph,
        IPackageManager: packageManager,
    };

    for (const account of user.accounts) {
        if (account.provider === "msa") {
            const mailServices = new MailServices(account.accessToken);
            (services as any).IMail = mailServices;
        }
    }

    const documentServiceFactories: IDocumentServiceFactory[] = [];
    // TODO: need to be support refresh token
    documentServiceFactories.push(new OdspDocumentServiceFactory(
        clientId,
        (siteUrl: string) => Promise.resolve(resolved.tokens.storageToken),
        () => Promise.resolve(resolved.tokens.socketToken),
        new BaseTelemetryNullLogger()));

    documentServiceFactories.push(new RouterliciousDocumentServiceFactory(
        false,
        new DefaultErrorTracking(),
        false,
        true,
        cache));

    const resolver = new ContainerUrlResolver(
        document.location.origin,
        jwt,
        new Map<string, IFluidResolvedUrl>([[url, resolved]]));

    const hostConf: IHostConfig = { documentServiceFactory: documentServiceFactories, urlResolver: resolver };

    // Provide access to all loader services from command line for easier testing as we bring more up
    // tslint:disable-next-line
    window["allServices"] = services;

    console.log(`Loading ${url}`);
    const loader = createWebLoader(
        resolved,
        new WhiteList(() => Promise.resolve(true)),
        pkg,
        scriptIds,
        config,
        services,
        hostConf);
    documentFactory.resolveLoader(loader);

    const div = document.getElementById("content") as HTMLDivElement;
    const container = await loader.resolve({ url });

    container.on("error", (error) => {
        console.error(error);
    });

    registerAttach(loader, container, url, div);

    // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
    // package.
    if (!container.existing) {
        await initializeChaincode(container, pkg);
    }
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseHost, IBaseHostConfig } from "@fluidframework/base-host";
import { IProxyLoaderFactory, IResolvedFluidCodeDetails } from "@fluidframework/container-definitions";
import {
    IDocumentServiceFactory,
    IFluidResolvedUrl,
} from "@fluidframework/driver-definitions";
import { WebWorkerLoaderFactory } from "@fluidframework/execution-context-loader";
import { OdspDocumentServiceFactory } from "@fluidframework/odsp-driver";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { ContainerUrlResolver } from "@fluidframework/routerlicious-host";
import { IGitCache } from "@fluidframework/server-services-client";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { SemVerCdnCodeResolver } from "@fluidframework/web-code-loader";
import Axios from "axios";
import { DocumentFactory } from "./documentFactory";
import { MicrosoftGraph } from "./graph";
import { PackageManager } from "./packageManager";
import { IHostServices } from "./services";
import { seedFromScriptIds } from "./helpers";

class MailServices {
    constructor(private readonly accessToken: string) {
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

async function getComponentAndRender(baseHost: BaseHost, url: string, div: HTMLDivElement) {
    const component = await baseHost.getComponent(url);
    if (component === undefined) {
        return;
    }

    // Render the component with an HTMLViewAdapter to abstract the UI framework used by the component
    const view = new HTMLViewAdapter(component);
    view.render(div, { display: "block" });
}

export async function initialize(
    url: string,
    resolved: IFluidResolvedUrl,
    cache: IGitCache,
    pkg: IResolvedFluidCodeDetails | undefined,
    scriptIds: string[],
    jwt: string,
    config: any,
    clientId: string,
    user: any,
) {
    const documentFactory = new DocumentFactory(config.tenantId);
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (user.accounts) {
        for (const account of user.accounts) {
            if (account.provider === "msa") {
                const mailServices = new MailServices(account.accessToken);
                (services as any).IMail = mailServices;
            }
        }
    }

    const documentServiceFactories: IDocumentServiceFactory[] = [];
    // TODO: need to be support refresh token
    documentServiceFactories.push(new OdspDocumentServiceFactory(
        async () => Promise.resolve(resolved.tokens.storageToken),
        async () => Promise.resolve(resolved.tokens.socketToken)));

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

    const hostConfig: IBaseHostConfig = {
        documentServiceFactory: documentServiceFactories,
        urlResolver: resolver,
        config,
        codeResolver: new SemVerCdnCodeResolver(),
        scope: services,
        proxyLoaderFactories: new Map<string, IProxyLoaderFactory>([["webworker", new WebWorkerLoaderFactory()]]),
    };

    // Provide access to all loader services from command line for easier testing as we bring more up
    // eslint-disable-next-line dot-notation
    window["allServices"] = services;

    const baseHost = new BaseHost(hostConfig, seedFromScriptIds(pkg, scriptIds));
    const loader = await baseHost.getLoader();
    documentFactory.resolveLoader(loader);

    console.log(`Loading ${url}`);

    const div = document.getElementById("content") as HTMLDivElement;

    const container = await baseHost.initializeContainer(url, pkg);

    // Currently this contextChanged handler covers both the initial load (from NullRuntime) as well as the upgrade
    // scenario.  In the next version of base-host it will only be for the upgrade scenario.
    container.on("contextChanged", () => {
        getComponentAndRender(baseHost, url, div).catch(() => { });
    });
    await getComponentAndRender(baseHost, url, div);

    container.on("error", (error) => {
        console.error(error);
    });

    return container;
}

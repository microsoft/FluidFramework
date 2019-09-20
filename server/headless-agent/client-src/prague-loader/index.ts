/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Browser, IPragueResolvedUrl } from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import { ContainerUrlResolver } from "@microsoft/fluid-routerlicious-host";
import { RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";
import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import * as jwt from "jsonwebtoken";
import * as url from "url";
import { LocalPlatform } from "./localPlatform";
import { WebLoader } from "./webLoader";

interface IWindow extends Window {
    closeContainer(): void;
}

async function attach(loader: Loader, baseUrl: string, platform: LocalPlatform) {
    console.log(baseUrl);
    const response = await loader.request({ url: baseUrl });

    if (response.status !== 200) {
        return;
    }
    console.log(response.mimeType);
    console.log(response.status);
    switch (response.mimeType) {
        case "fluid/component":
            const component = response.value as IComponentRuntime;
            component.attach(platform);
            console.log(component.id);
            break;
    }
}

export async function registerAttach(loader: Loader, container: Container, uri: string, platform: LocalPlatform) {
    console.log(`Attaching a web platform`);
    attach(loader, uri, platform).catch((err) => {
        console.log(err);
    });
    container.on("contextChanged", (value) => {
        attach(loader, uri, platform);
    });
}

export async function startLoading(
    id: string,
    routerlicious: string,
    historian: string,
    tenantId: string,
    token: string,
    jwtKey: string,
    packageUrl: string,
    loaderType: string): Promise<void> {
    console.log(`Loading ${id} as ${loaderType}`);

    const hostToken = jwt.sign(
        {
            user: "headless-agent",
        },
        jwtKey);

    const documentUrl = `fluid://${url.parse(routerlicious).host}` +
    `/${encodeURIComponent(tenantId)}` +
    `/${encodeURIComponent(id)}`;

    const deltaStorageUrl = routerlicious +
    "/deltas" +
    `/${encodeURIComponent(tenantId)}/${encodeURIComponent(id)}`;

    const storageUrl =
    historian +
    "/repos" +
    `/${encodeURIComponent(tenantId)}`;

    const resolved: IPragueResolvedUrl = {
        endpoints: {
            deltaStorageUrl,
            ordererUrl: routerlicious,
            storageUrl,
        },
        tokens: { jwt: token },
        type: "fluid",
        url: documentUrl,
    };

    const resolver = new ContainerUrlResolver(
        routerlicious,
        hostToken,
        new Map([[documentUrl, resolved]]));
    const codeLoader = new WebLoader(packageUrl);

    const loader = new Loader(
        { resolver },
        new RouterliciousDocumentServiceFactory(),
        codeLoader,
        { encrypted: undefined, blockUpdateMarkers: true, client: { type: loaderType } });

    const container = await loader.resolve({ url: documentUrl });
    console.log(`Resolved ${documentUrl}`);

    // Wait to be fully connected!
    if (!container.connected) {
        await new Promise<void>((resolve) => container.on("connected", () => resolve()));
    }

    console.log(`${container.clientId} is now fully connected to ${container.id}`);

    checkContainerActivity(container);

    const platform = new LocalPlatform(document.getElementById("content"));
    registerAttach(loader, container, documentUrl, platform);
}

// Checks container quorum for connected clients. Once all client leaves,
// invokes the close function injected by puppeteer launcher.
function checkContainerActivity(container: Container) {
    const quorum = container.getQuorum();
    quorum.on("removeMember", (clientId: string) => {
        if (container.clientId === clientId) {
            (window as IWindow).closeContainer();
        } else {
            for (const client of quorum.getMembers()) {
                if (!client[1].client || !client[1].client.type || client[1].client.type === Browser) {
                    return;
                }
            }
            (window as IWindow).closeContainer();
        }
    });
}

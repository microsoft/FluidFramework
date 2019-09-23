/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentHTMLVisual,
    IComponentQueryableLegacy,
} from "@microsoft/fluid-component-core-interfaces";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import { Browser, IFluidResolvedUrl } from "@microsoft/fluid-protocol-definitions";
import { RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";
import { ContainerUrlResolver } from "@microsoft/fluid-routerlicious-host";
import { WebCodeLoader } from "@microsoft/fluid-web-code-loader";
import * as jwt from "jsonwebtoken";
import * as url from "url";

interface IWindow extends Window {
    closeContainer(): void;
}

async function attach(loader: Loader, baseUrl: string, div: HTMLDivElement) {
    const response = await loader.request({ url: baseUrl });

    if (response.status !== 200 ||
        !(
            response.mimeType === "fluid/component" ||
            response.mimeType === "prague/component"
        )) {
        return;
    }

    // Check if the component is viewable
    const component = response.value as IComponent;
    const queryable = component as IComponentQueryableLegacy;
    let viewable = component.IComponentHTMLVisual;
    if (!viewable && queryable.query) {
        viewable = queryable.query<IComponentHTMLVisual>("IComponentHTMLVisual");
    }
    if (viewable) {
        const renderable =
            viewable.addView ? viewable.addView() : viewable;

        renderable.render(div, { display: "block" });
        return;
    }
}

export async function registerAttach(loader: Loader, container: Container, uri: string, div: HTMLDivElement) {
    console.log(`Attaching a web platform`);
    attach(loader, uri, div).catch((err) => {
        console.log(err);
    });
    container.on("contextChanged", (value) => {
        attach(loader, uri, div);
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
    loaderType: string,
    div: HTMLDivElement): Promise<void> {
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

    const resolved: IFluidResolvedUrl = {
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
    const codeLoader = new WebCodeLoader(packageUrl);

    const loader = new Loader(
        { resolver },
        new RouterliciousDocumentServiceFactory(),
        codeLoader,
        { encrypted: undefined, blockUpdateMarkers: true, client: { type: loaderType } },
        null);

    const container = await loader.resolve({ url: documentUrl });
    console.log(`Resolved ${documentUrl}`);

    // Wait to be fully connected!
    if (!container.connected) {
        await new Promise<void>((resolve) => container.on("connected", () => resolve()));
    }

    console.log(`${container.clientId} is now fully connected to ${container.id}`);

    checkContainerActivity(container);

    registerAttach(loader, container, documentUrl, div);
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

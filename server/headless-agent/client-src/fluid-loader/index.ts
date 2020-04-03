/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseHost, IBaseHostConfig } from "@microsoft/fluid-base-host";
import { Container } from "@microsoft/fluid-container-loader";
import { IDocumentServiceFactory, IFluidResolvedUrl, IResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";

interface IWindow extends Window {
    startLoading(): Promise<void>;
    closeContainer(): void;
}

export async function startLoading(resolvedUrl: IResolvedUrl): Promise<Container> {
    const serviceFactory = new RouterliciousDocumentServiceFactory(
        false,
        new DefaultErrorTracking(),
        false,
        true);
    const documentServiceFactories: IDocumentServiceFactory[] = [];
        documentServiceFactories.push(serviceFactory);
    const baseHostConfig: IBaseHostConfig = {
        documentServiceFactory: documentServiceFactories,
        urlResolver: {
            resolve: () => Promise.resolve(resolvedUrl),
        },
    };

    const baseHost = new BaseHost(baseHostConfig, undefined, [] );
    const container =  await baseHost.loadAndRender(
        (resolvedUrl as IFluidResolvedUrl).url,
        document.getElementById("content") as HTMLDivElement);

    return await new Promise((resolve, reject) => {
        container.on("op", () => {
            resolve(container);
        });
    });
}

// Checks container quorum for connected clients. Once all client leaves,
// invokes the close function injected by puppeteer launcher.
export function checkContainerActivity(container: Container) {
    const quorum = container.getQuorum();
    quorum.on("removeMember", (clientId: string) => {
        if (container.clientId === clientId) {
            (window as unknown as IWindow).closeContainer();
        } else {
            for (const client of quorum.getMembers()) {
                if (!client[1].client || client[1].client.details.capabilities.interactive) {
                    return;
                }
            }
            (window as unknown as IWindow).closeContainer();
        }
    });
}

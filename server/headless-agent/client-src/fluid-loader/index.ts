/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseHost, IBaseHostConfig } from "@fluidframework/base-host";
import { Container } from "@fluidframework/container-loader";
import { IFluidResolvedUrl, IResolvedUrl } from "@fluidframework/driver-definitions";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { SemVerCdnCodeResolver } from "@fluidframework/web-code-loader";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";

interface IWindow extends Window {
    startLoading(): Promise<void>;
    closeContainer(): void;
}

export async function startLoading(resolvedUrl: IResolvedUrl) {
    const serviceFactory = new RouterliciousDocumentServiceFactory(
        false,
        new DefaultErrorTracking(),
        false,
        true);
    const baseHostConfig: IBaseHostConfig = {
        documentServiceFactory: serviceFactory,
        urlResolver: {
            resolve: () => Promise.resolve(resolvedUrl),
            async getAbsoluteUrl(
                resolvedUrl: IResolvedUrl,
                relativeUrl: string,
            ): Promise<string> {
                throw new Error("Not implemented");
            },
        },
        codeResolver: new SemVerCdnCodeResolver(),
    };

    const baseHost = new BaseHost(baseHostConfig);
    const component =  await baseHost.getComponent((resolvedUrl as IFluidResolvedUrl).url);
    const adapter = new HTMLViewAdapter(component);
    adapter.render(document.getElementById("content") as HTMLDivElement);
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

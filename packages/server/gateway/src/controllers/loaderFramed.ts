/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IGitCache } from "@microsoft/fluid-server-services-client";
import { createWebLoader, initializeChaincode, IPrivateSessionInfo, registerAttach } from "@prague/base-host";
import { IComponent } from "@prague/component-core-interfaces";
import { IResolvedPackage } from "@prague/loader-web";
import { IFluidResolvedUrl, IResolvedUrl } from "@prague/protocol-definitions";
import Axios from "axios";
import { DocumentFactory } from "./documentFactory";
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
    scope: IComponent,
    innerSession: boolean = false,
    outerSession: boolean = true,
) {

    console.log(`Loading ${url}`);

    const privateSession: IPrivateSessionInfo = {
        innerSession,
        outerSession,
        request: { url },
    };
    console.log(`Private Session?`);
    console.log(privateSession);

    const services: IHostServices = undefined;
    let documentFactory: DocumentFactory;

    const div = document.getElementById("content") as HTMLDivElement;

    // Don't resolve in the outer session
    if (!privateSession.outerSession) {
        const loader = createWebLoader(
            url,
            resolved,
            cache,
            pkg,
            scriptIds,
            npm,
            jwt,
            config,
            services,
            privateSession);

        documentFactory = new DocumentFactory(config.tenantId,
            config.moniker,
            config.url);

        documentFactory.resolveLoader(loader);
        const container = await loader.resolve({ url });
        registerAttach(loader, container, url, div);

        // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
        // package.
        if (!container.existing) {
            await initializeChaincode(container, pkg);
        }
    } else {
        config.moniker = (await Axios.get("/api/v1/moniker")).data;
        config.url = url;
        privateSession.frameP = createFrame(div, createIFrameHTML(resolved, pkg, scriptIds, scope, config));
        createWebLoader(
            url,
            resolved,
            cache,
            pkg,
            scriptIds,
            npm,
            jwt,
            config,
            services, // not required if we don't resolve
            privateSession);
    }
}

function createFrame(div: HTMLElement, framesrc: string): Promise<HTMLIFrameElement> {
    const innerDiv = document.createElement("div");
    innerDiv.id = "content";

    const iframe = document.createElement("iframe");
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    div.style.height = "100vh"; // Remove when done testing
    iframe.sandbox.add("allow-scripts");

    iframe.srcdoc = framesrc;

    const frameP = new Promise<HTMLIFrameElement>((resolve) => {
        iframe.onload = () => {
            resolve(iframe);
        };
    });

    div.appendChild(iframe);
    return frameP;
}

function createIFrameHTML(resolved: IResolvedUrl,
                          pkg: IResolvedPackage,
                          scriptIds: string[],
                          scope: IComponent,
                          config: any): string {
    const url = window.location.href.split("&privateSession")[0];
    let santizedResolved: IFluidResolvedUrl;

    if (resolved.type === "prague") {
        santizedResolved = {
            type: resolved.type,
            endpoints: resolved.endpoints,
            tokens: undefined,
            url: resolved.url,
        };
    } else {
        throw new Error("Resolved has not been passed in");
    }

    return `
    <html>
    <head>
    <script type="text/javascript" src="${document.location.origin}/public/scripts/dist/controllers.js"></script>
    </head>
    <body>
        <div id="content"></div>
        <script type="text/javascript">
            controllers.loaderFramed.initialize(
                "${url}",
                ${JSON.stringify(santizedResolved)}, // resolved
                undefined, // cache
                ${JSON.stringify(pkg)}, // chaincode
                ${JSON.stringify(scriptIds)}, // scriptIds
                undefined, // npm
                undefined, // jwt
                ${JSON.stringify(config)}, // config
                ${JSON.stringify(scope)}, // scope
                true, // innerSession
                false, // outerSession
                );
        </script
    </body>
    </html>
    `;
}

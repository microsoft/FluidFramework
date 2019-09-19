/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IGitCache } from "@microsoft/fluid-server-services-client";
import { createWebLoader,
    IHostConfig,
    initializeChaincode,
    IPrivateSessionInfo,
    registerAttach,
} from "@microsoft/fluid-base-host";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { createProtocolToFactoryMapping, selectDocumentServiceFactoryForProtocol } from "@microsoft/fluid-container-loader";
import { InnerDocumentServiceFactory, InnerUrlResolver, OuterDocumentServiceFactory } from "@prague/iframe-socket-storage";
import { IResolvedPackage } from "@microsoft/fluid-web-code-loader";
import { OdspDocumentServiceFactory } from "@microsoft/fluid-odsp-driver";
import { IDocumentServiceFactory, IFluidResolvedUrl, IResolvedUrl } from "@microsoft/fluid-protocol-definitions";
import { ContainerUrlResolver } from "@microsoft/fluid-routerlicious-host";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";
import { BaseTelemetryNullLogger } from "@microsoft/fluid-core-utils";
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
        const hostConf: IHostConfig = {
            documentServiceFactory: new InnerDocumentServiceFactory(),
            urlResolver: new InnerUrlResolver(resolved),
        };
        const loader = createWebLoader(
            resolved,
            pkg,
            scriptIds,
            npm,
            config,
            services,
            hostConf);

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
        const documentServiceFactories: IDocumentServiceFactory[] = [];
        documentServiceFactories.push(new OdspDocumentServiceFactory(
            "Server-Gateway",
            (siteUrl: string) => Promise.resolve("fake token"),
            () => Promise.resolve("fake token"),
            new BaseTelemetryNullLogger()));

        documentServiceFactories.push(new RouterliciousDocumentServiceFactory(
            false,
            new DefaultErrorTracking(),
            false,
            true,
            cache));
        const factoryMap = createProtocolToFactoryMapping(documentServiceFactories);

        config.moniker = (await Axios.get("/api/v1/moniker")).data;
        config.url = url;
        privateSession.frameP = createFrame(div, createIFrameHTML(resolved, pkg, scriptIds, scope, config));
        const resolver = new ContainerUrlResolver(
            document.location.origin,
            jwt,
            new Map<string, IResolvedUrl>([[url, resolved]]));

        const options = {
            blockUpdateMarkers: true,
            config,
            tokens: (resolved as IFluidResolvedUrl).tokens,
        };
        new OuterDocumentServiceFactory(
            selectDocumentServiceFactoryForProtocol(resolved as IFluidResolvedUrl, factoryMap),
            privateSession.frameP,
            options,
            { resolver },
            ).createDocumentServiceFromRequest({ url });
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

    if (resolved.type === "prague" || resolved.type === "fluid") {
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

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseHost, IBaseHostConfig } from "@microsoft/fluid-base-host";
import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import { Container } from "@microsoft/fluid-container-loader";
import { BaseTelemetryNullLogger } from "@microsoft/fluid-common-utils";
import {
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IResolvedUrl,
} from "@microsoft/fluid-driver-definitions";
import { configurableUrlResolver } from "@microsoft/fluid-driver-utils";
import { FluidAppOdspUrlResolver } from "@microsoft/fluid-fluidapp-odsp-urlresolver";
import { OdspDocumentServiceFactory } from "@microsoft/fluid-odsp-driver";
import { OdspUrlResolver } from "@microsoft/fluid-odsp-urlresolver";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";
import { ContainerUrlResolver } from "@microsoft/fluid-routerlicious-host";
import { RouterliciousUrlResolver } from "@microsoft/fluid-routerlicious-urlresolver";
import { HTMLViewAdapter } from "@microsoft/fluid-view-adapters";
import { extractDetails, IResolvedPackage } from "@microsoft/fluid-web-code-loader";
import { v4 } from "uuid";
import { IOdspTokenApi, IRouterliciousTokenApi, ITokenApis } from "./utils";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const packageJson = require("../package.json");

// This is insecure, but is being used for the time being for ease of use during the hackathon.
const appTenants = [
    {
        id: "fluid",
        key: "43cfc3fbf04a97c0921fd23ff10f9e4b",
    },
];

/**
 * A single line, basic function for loading Fluid Components.
 *
 * This function purposefully does not expose all functionality.
 *
 * @param url - Url of the Fluid component to be loaded
 * @param div - The div to load the component into
 * @param pkg - A resolved package with cdn links. Overrides a query paramter.
 * @param getToken - A function that either returns an SPO token, or a Routerlicious tenant token
 * @param clientId - The SPO clientId
 * @param clientSecret - The SPO clientSecret
 * @param scriptIds - the script tags the chaincode are attached to the view with
 */
export async function loadFluidContainer(
    url: string,
    div: HTMLDivElement,
    tokenApiConfig: ITokenApis,
    clientId?: string,
    clientSecret?: string,
    pkg?: IResolvedPackage,
    scriptIds?: string[],
): Promise<Container> {

    let resolved: IResolvedUrl;

    const resolvedPackage = pkg === undefined ? parseUrlToResolvedPackage(url) : pkg;

    if (isRouterliciousUrl(url)) {
        const routerliciousApiConfig = tokenApiConfig as IRouterliciousTokenApi;
        if (routerliciousApiConfig) {
            const resolver = new RouterliciousUrlResolver(undefined, undefined, appTenants);
            resolved = await resolver.resolve({ url });
        } else {
            throw new Error("No token api supplied!!");
        }
    } else if (isSpoUrl(url)) {
        const odspApiConfig = tokenApiConfig as IOdspTokenApi;
        if (odspApiConfig && odspApiConfig.getStorageToken && odspApiConfig.getWebsocketToken) {
            const resolverList = [
                new OdspUrlResolver(),
                new FluidAppOdspUrlResolver(),
            ];
            resolved = await configurableUrlResolver(resolverList, { url });
        } else {
            throw new Error("No token api supplied!!");
        }
    } else {
        throw new Error("Non-Compatible Url.");
    }
    const containerP = loadContainer(
        url,
        resolved as IFluidResolvedUrl,
        tokenApiConfig,
        div,
        clientId,
        clientSecret,
        resolvedPackage,
        scriptIds);
    return containerP;
}

export function parseUrlToResolvedPackage(url: string): IResolvedPackage {
    const pkg: IResolvedPackage = {} as any;

    const urlRequest = new URL(url);
    const searchParams = urlRequest.searchParams;
    const chaincode = searchParams.get("chaincode");

    const cdn = searchParams.get("cdn") ?
        searchParams.get("cdn") : "https://pragueauspkn-3873244262.azureedge.net";
    const entryPoint = searchParams.get("entrypoint");
    let codeDetails: IFluidCodeDetails;

    if (chaincode.startsWith("http")) {
        codeDetails = {
            config: {
                [`@gateway:cdn`]: chaincode,
            },
            package: {
                fluid: {
                    browser: {
                        umd: {
                            files: [chaincode],
                            library: entryPoint,
                        },
                    },
                },
                name: `@gateway/${v4()}`,
                version: "0.0.0",
            },
        };
    } else {
        const details = extractDetails(chaincode);
        codeDetails = {
            config: {
                [`@${details.scope}:cdn`]: cdn,
            },
            package: chaincode,
        };
    }
    pkg.details = codeDetails;

    return pkg;
}

async function loadContainer(
    href: string,
    resolved: IFluidResolvedUrl,
    tokenApiConfig: ITokenApis,
    div: HTMLDivElement,
    clientId: string,
    secret: string,
    pkg: IResolvedPackage,
    scriptIds?: string[],
): Promise<Container> {

    let documentServiceFactory: IDocumentServiceFactory;
    const protocol = new URL(resolved.url).protocol;
    if (protocol === "fluid-odsp:") {
        const config = tokenApiConfig as IOdspTokenApi;
        documentServiceFactory = new OdspDocumentServiceFactory(
            clientId,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            config.getStorageToken,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            config.getWebsocketToken,
            new BaseTelemetryNullLogger());
    } else if (protocol === "fluid:") {
        documentServiceFactory = new RouterliciousDocumentServiceFactory(
            false,
            new DefaultErrorTracking(),
            false,
            true,
            undefined);
    }

    const resolver = new ContainerUrlResolver(
        document.location.origin,
        "",
        new Map<string, IResolvedUrl>([[href, resolved]]));

    const hostConf: IBaseHostConfig = {
        documentServiceFactory,
        urlResolver: resolver,
    };

    const baseHost = new BaseHost(
        hostConf,
        pkg,
        scriptIds,
    );
    const container = await baseHost.initializeContainer(href, pkg.details);
    container.on("contextChanged", (value) => {
        getComponentAndRender(baseHost, href, div).catch(() => { });
    });
    await getComponentAndRender(baseHost, href, div);

    return container;
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

const routerliciousRegex = /^(http(s)?:\/\/)?www\..{3,9}\.prague\.office-int\.com\/loader\/.*/;

export const isRouterliciousUrl = (url: string): boolean => routerliciousRegex.exec(url) ? true : false;

export function isSpoUrl(url: string): boolean {
    const reqUrl = new URL(url);
    for (const server of spoUrls) {
        if (server === reqUrl.hostname) {
            return true;
        }
    }
    return false;
}

const spoUrls = [
    "microsoft-my.sharepoint-df.com",
    "microsoft-my.sharepoint.com",
    "microsoft.sharepoint-df.com",
    "microsoft.sharepoint.com",
    "dev.fluid.office.com",
    "fluidpreview.office.net",
];

/**
 * Create an IFrame for loading Fluid Components.
 *
 * @param url - Url of the Fluid component to be loaded
 * @param div - The div to load the component into
 * @param getToken - A function that either returns an SPO token, or a Routerlicious tenant token
 * @param clientId - The SPO clientId.
 * @param secret - The SPO clientSecret.
 * @param libraryName - if loaded from React, this should be "reactLoader"
 */
export async function loadIFramedFluidContainer(
    url: string,
    div: HTMLDivElement,
    tokenApiConfig: ITokenApis = { getToken: async () => Promise.resolve("") },
    clientId?: string,
    secret?: string,
    libraryName: string = "tinyWebLoader"): Promise<void> {

    let scriptUrl: string;
    // main.bundle.js refers to the output of webpacking this file.
    if (packageJson.version.split(".")[2] === "0") {
        console.log("Ends in 0, so we'll use the local bundle");
        scriptUrl = "dist/main.bundle.js";
    } else {
        // eslint-disable-next-line max-len
        scriptUrl = `https://pragueauspkn-3873244262.azureedge.net/@fluid-example/tiny-web-host@${packageJson.version}/dist/main.bundle.js`;
    }

    // As per IComponentHTMLView, if the div has a size already, the render is expected to fill the space
    // it has been given. If not, the render should grow based on its own content.
    const divRect = div.getBoundingClientRect();
    const expandToGivenSize = divRect.height && divRect.width;

    const iframe = document.createElement("iframe");
    iframe.frameBorder = "0";
    iframe.id = "containerid";

    const componentDivStyle = expandToGivenSize ? `style="position:absolute; top:0; left:0; bottom:0; right:0;"` : "";

    iframe.srcdoc = `
    <!DOCTYPE html>
    <html>

    <head>
    <script type="text/javascript" src=${scriptUrl}></script>
    </head>

    <body>
        <div id="componentDiv" ${componentDivStyle}></div>
        <script>
                console.log("Welcome to the IFrame");
                function start(url, token, appId) {
                    ${libraryName}.loadFluidContainer(
                        url,
                        document.getElementById("componentDiv"),
                        tokenApiConfig,
                        "clientId",
                        "clientSecret");
                }

                document.body.style.margin = '0';
                window.addEventListener("message", (message) => {
                    console.log(message);
                    start(message.data.url, message.data.token, message.data.appId);
                });
            </script>
    </body>
    </html>  `;

    if (expandToGivenSize) {
        iframe.style.height = "100%";
        iframe.style.width = "100%";
    }

    div.appendChild(iframe);
    iframe.onload = async () => {
        iframe.contentWindow.postMessage({
            appId: "app Id",
            token: "dummy token",
            url,
        }, "*");
    };

    return;
}

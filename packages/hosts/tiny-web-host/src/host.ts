/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseHost, IBaseHostConfig } from "@microsoft/fluid-base-host";
import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import { BaseTelemetryNullLogger, configurableUrlResolver } from "@microsoft/fluid-core-utils";
import {
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IResolvedUrl,
} from "@microsoft/fluid-driver-definitions";
import { FluidAppOdspUrlResolver } from "@microsoft/fluid-fluidapp-odsp-urlresolver";
import { OdspDocumentServiceFactory } from "@microsoft/fluid-odsp-driver";
import { OdspUrlResolver } from "@microsoft/fluid-odsp-urlresolver";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";
import { ContainerUrlResolver } from "@microsoft/fluid-routerlicious-host";
import { RouterliciousUrlResolver } from "@microsoft/fluid-routerlicious-urlresolver";
import { extractDetails, IResolvedPackage } from "@microsoft/fluid-web-code-loader";
import { v4 } from "uuid";
import { IOdspTokenApi, IRouterliciousTokenApi, ITokenApis } from "./utils";

// tslint:disable-next-line: no-var-requires no-require-imports
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
): Promise<any> {

    let componentP: Promise<any>;
    let resolved: IResolvedUrl;

    const newPkg: IResolvedPackage = pkg ? pkg : {} as any;
    if (!pkg) {

        const urlRequest = new URL(url);
        const searchParams = urlRequest.searchParams;
        const chaincode = searchParams.get("chaincode");
        console.log(chaincode);

        const cdn = "https://pragueauspkn-3873244262.azureedge.net";
        const entryPoint = searchParams.get("entrypoint");
        let codeDetails: IFluidCodeDetails;

        if (chaincode.indexOf("http") === 0) {
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
            newPkg.details = codeDetails;
        }
    }

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
    componentP =
        loadContainer(url, resolved as IFluidResolvedUrl, tokenApiConfig, div, clientId, clientSecret, pkg, scriptIds);
    return componentP;
}

async function loadContainer(
    href: string,
    resolved: IFluidResolvedUrl,
    tokenApiConfig: ITokenApis,
    div: HTMLDivElement,
    clientId: string,
    secret: string,
    pkg?: IResolvedPackage,
    scriptIds?: string[],
): Promise<any> {

    let documentServiceFactory: IDocumentServiceFactory;
    const protocol = new URL(resolved.url).protocol;
    if (protocol === "fluid-odsp:") {
        const config = tokenApiConfig as IOdspTokenApi;
        documentServiceFactory = new OdspDocumentServiceFactory(
            clientId,
            config.getStorageToken,
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
    // tslint:disable-next-line: no-unsafe-any
    return BaseHost.start(
        hostConf,
        href,
        // tslint:disable-next-line: no-unsafe-any
        resolved, // resolved, IResolvedUrl,
        pkg, // pkg, IResolvedPackage, (gateway/routes/loader has an example (pkgP))
        scriptIds, // scriptIds, string[], defines the id of the script tag added to the page
        div,
    );
}

const routerliciousRegex = "^(http(s)?:\/\/)?www\..{3,9}\.prague\.office-int\.com\/loader\/.*";

export function isRouterliciousUrl(url: string): boolean {
    return url.match(routerliciousRegex) ? true : false;
}

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
    tokenApiConfig: ITokenApis = { getToken: () => Promise.resolve("") },
    clientId?: string,
    secret?: string,
    libraryName: string = "tinyWebLoader"): Promise<any> {

    let scriptUrl: string;
    // main.bundle.js refers to the output of webpacking this file.
    // tslint:disable-next-line: no-unsafe-any
    if (packageJson.version.split(".")[2] === "0") {
        console.log("Ends in 0, so we'll use the local bundle");
        scriptUrl = "dist/main.bundle.js";
    } else {
        // tslint:disable-next-line: max-line-length no-unsafe-any
        scriptUrl = `https://pragueauspkn-3873244262.azureedge.net/@fluid-example/tiny-web-host@${packageJson.version}/dist/main.bundle.js`;
    }

    // As per IComponentHTMLVisual, if the div has a size already, the render is expected to fill the space
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

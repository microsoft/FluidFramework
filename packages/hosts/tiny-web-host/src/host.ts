/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IHostConfig, start } from "@microsoft/fluid-base-host";
import { IDocumentServiceFactory, IResolvedUrl } from "@microsoft/fluid-protocol-definitions";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";
import { ContainerUrlResolver } from "@microsoft/fluid-routerlicious-host";
import { IResolvedPackage } from "@microsoft/fluid-web-code-loader";
import * as UrlParse from "url-parse";
import { resolveUrl } from "./urlResolver";

// tslint:disable-next-line: no-var-requires no-require-imports
const packageJson = require("../package.json");

const npm = "https://pragueauspkn-3873244262.azureedge.net";

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
 * @param url - Url of the Fluid component to be loaded (spo and spo-df will both be loaded against odsp)
 * @param getToken - A function that either returns an SPO token, or a Routerlicious tenant token
 * @param div - The div to load the component into
 * @param appId - The SPO appId. If no SPO AppId available, a consistent and descriptive app name is acceptable
 * @param clientId - The SPO clientId
 * @param clientSecret - The SPO clientSecret
 * @param pkg - A resolved package with cdn links. Overrides a query paramter.
 * @param scriptIds - the script tags the chaincode are attached to the view with
 */
export async function loadFluidComponent(
    url: string,
    getToken: () => Promise<string>,
    div: HTMLDivElement,
    appId: string,
    clientId: string,
    secret: string,
    pkg?: IResolvedPackage,
    scriptIds?: string[],
): Promise<any> {

    let componentP: Promise<any>;
    if (isRouterliciousUrl(url)) {
        componentP = startWrapper(url, getToken, div, clientId, secret, pkg, scriptIds);
    } else if (isSpoUrl(url)) {
        throw new Error("Office.com URLs are not yet supported.");
    } else {
        throw new Error("Non-Compatible Url.");
    }
    return componentP;
}

async function startWrapper(
    href: string,
    getToken: () => Promise<string>,
    div: HTMLDivElement,
    clientId: string,
    secret: string,
    pkg?: IResolvedPackage,
    scriptIds?: string[],
): Promise<any> {
    const parsedUrl = fluidUrlParser(href);
    const config = {
        blobStorageUrl: parsedUrl.storageUrl,
        clientId,
        deltaStorageUrl: parsedUrl.deltaStorageUrl,
        secret,
        serverUrl: parsedUrl.ordererUrl,
    };

    // tslint:disable-next-line: no-unsafe-any
    const [resolvedP, fullTreeP] =
        resolveUrl(config, appTenants, parsedUrl.tenant, parsedUrl.container, getToken) as any;

    return Promise.all([resolvedP, fullTreeP])
        .then(async ([resolved, fullTree]) => {
            const documentServiceFactory: IDocumentServiceFactory = new RouterliciousDocumentServiceFactory(
                false,
                new DefaultErrorTracking(),
                false,
                true,
                undefined);

            const resolver = new ContainerUrlResolver(
                document.location.origin,
                await getToken(),
                new Map<string, IResolvedUrl>([[href, resolved as IResolvedUrl]]));

            const hostConf: IHostConfig = {
                documentServiceFactory,
                urlResolver: resolver,
            };
            // tslint:disable-next-line: no-unsafe-any
            return start(
                href,
                // tslint:disable-next-line: no-unsafe-any
                resolved, // resolved, IResolvedUrl,
                pkg, // pkg, IResolvedPackage, (gateway/routes/loader has an example (pkgP))
                scriptIds, // scriptIds, string[], defines the id of the script tag added to the page
                npm, // string,
                {},
                {},
                div,
                hostConf,
            );
        }, (error) => {
            throw error;
        }).catch((error) => {
            throw error;
        });
}

function fluidUrlParser(href: string) {
    const url = UrlParse(href, true);
    const pathParts = url.pathname.split("/");

    const container = pathParts[3];
    const tenant = pathParts[2];
    const storageUrl = `https://${url.host.replace("www", "historian")}/repos/${tenant}`;
    const ordererUrl = `https://${url.host.replace("www", "alfred")}`;
    const deltaStorageUrl = `${ordererUrl}/deltas/${tenant}/${container}`;
    return {
        container,
        deltaStorageUrl,
        ordererUrl,
        storageUrl,
        tenant,
    };
}

const spoRegex = "^http(s)?:\/\/\\w{0,12}\.www\.office\.com\/content\/bohemia\?.*";
const routerliciousRegex = "^(http(s)?:\/\/)?www\..{3,9}\.prague\.office-int\.com\/loader\/.*";

/**
 * Simple function to test if a URL is a valid SPO or Routerlicious Fluid link
 *
 * @param url - Url to Test
 */
export function isFluidURL(url: string): boolean {
    if (isRouterliciousUrl(url)) {
        return true;
    } else if (isSpoUrl(url)) {
        return true;
    }
    return false;
}

export function isRouterliciousUrl(url: string): boolean {
    return url.match(routerliciousRegex) ? true : false;
}

export function isSpoUrl(url: string): boolean {
    return url.match(spoRegex) ? true : false;
}

/**
 * Create an IFrame for loading Fluid Components.
 *
 * @param url - Url of the Fluid component to be loaded
 * @param getToken - A function that either returns an SPO token, or a Routerlicious tenant token
 * @param div - The div to load the component into
 * @param clientId - The SPO clientId.
 * @param secret - The SPO clientSecret.
 * @param libraryName - if loaded from React, this should be "reactLoader"
 */
export async function loadIFramedFluidComponent(
    url: string,
    getToken: () => Promise<string>,
    div: HTMLDivElement,
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
                    ${libraryName}.loadFluidComponent(
                        url,
                        () => { "return token"},
                        document.getElementById("componentDiv"),
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
            token: await getToken(),
            url,
        }, "*");
    };

    return;
}

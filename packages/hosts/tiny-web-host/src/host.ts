/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { start } from "@prague/base-host";
import * as UrlParse from "url-parse";
import { resolveUrl } from "./urlResolver";
import { auth } from "./utils";

const npm = "https://pragueauspkn-3873244262.azureedge.net";

// This is insecure, but is being used for the time being for ease of use during the hackathon.
const appTenants = [
    {
        id: "prague",
        key: "43cfc3fbf04a97c0921fd23ff10f9e4b",
    },
];

/**
 * A single line, basic function for loading Prague Components.
 *
 * This function purposefully does not expose all functionality.
 *
 * @param url - Url of the Prague component to be loaded (spo and spo-df will both be loaded against odsp)
 * @param getToken - A function that either returns an SPO token, or a Routerlicious tenant token
 * @param div - The div to load the component into
 * @param appId - The SPO appId. If no SPO AppId available, a consistent and descriptive app name is acceptable
 * @param clientId - The SPO clientId
 * @param clientSecret - The SPO clientSecret
 */
export async function loadPragueComponent(
    url: string,
    getToken: () => Promise<string>,
    div: HTMLDivElement,
    appId: string,
    clientId: string,
    secret: string,
): Promise<any> {

    let componentP: Promise<any>;
    if (isRouterliciousUrl(url)) {
        componentP = startWrapper(url, getToken, div, clientId, secret);
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
): Promise<any> {
    const parsedUrl = pragueUrlParser(href);
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
            // tslint:disable-next-line: no-unsafe-any
            return start(
                href,
                // tslint:disable-next-line: no-unsafe-any
                resolved, // resolved, IResolvedUrl,
                undefined, // cache, IGitCache (could be a value)
                undefined, // pkg, IResolvedPackage, (gateway/routes/loader has an example (pkgP))
                undefined, // scriptIds, string[], needed only if pkg is not undefined
                npm, // string,
                await auth(parsedUrl.tenant, parsedUrl.container, getToken), // string,
                div,
            );
        }, (error) => {
            throw error;
        }).catch((error) => {
            throw error;
        });
}

function pragueUrlParser(href: string) {
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
 * Simple function to test if a URL is a valid SPO or Routerlicious Prague link
 *
 * @param url - Url to Test
 */
export function isPragueURL(url: string): boolean {
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

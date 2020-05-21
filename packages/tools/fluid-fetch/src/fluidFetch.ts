/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import * as util from "util";
import { isSharepointURL } from "@fluidframework/odsp-utils";
import { paramSaveDir, paramURL, parseArguments } from "./fluidFetchArgs";
import { connectionInfo, fluidFetchInit } from "./fluidFetchInit";
import { fluidFetchMessages } from "./fluidFetchMessages";
import { getSharepointFiles } from "./fluidFetchSharePoint";
import { fluidFetchSnapshot } from "./fluidFetchSnapshot";

async function fluidFetchOneFile(urlStr: string, name?: string) {
    const documentService = await fluidFetchInit(urlStr);
    const saveDir = paramSaveDir ? (name ? `${paramSaveDir}/${name}` : paramSaveDir) : undefined;
    if (saveDir !== undefined) {
        const mkdir = util.promisify(fs.mkdir);
        const writeFile = util.promisify(fs.writeFile);
        await mkdir(saveDir, { recursive: true });
        const info = {
            creationDate: new Date().toString(),
            connectionInfo,
            url: urlStr,
        };
        await writeFile(`${saveDir}/info.json`, JSON.stringify(info, undefined, 2));
    }

    await fluidFetchMessages(documentService, saveDir);
    await fluidFetchSnapshot(documentService, saveDir);
}

function getSharepointServerRelativePathFromURL(url: URL) {
    if (url.pathname.startsWith("/_api/v2.1/drives/")) {
        return undefined;
    }

    const hostnameParts = url.hostname.split(".");
    const suffix = hostnameParts[0].endsWith("-my") ? "/_layouts/15/onedrive.aspx" : "/forms/allitems.aspx";

    let sitePath = url.pathname;
    if (url.searchParams.has("id")) {
        sitePath = url.searchParams.get("id") as string;
    } else if (url.searchParams.has("RootFolder")) {
        sitePath = url.searchParams.get("RootFolder") as string;
    } else if (url.pathname.toLowerCase().endsWith(suffix)) {
        sitePath = sitePath.substr(0, url.pathname.length - suffix.length);
    }

    return decodeURI(sitePath);
}

async function fluidFetchMain() {
    if (!paramURL) {
        return;
    }

    const url = new URL(paramURL);
    const server = url.hostname;
    if (isSharepointURL(server)) {
        // See if the url given represent a sharepoint directory
        const serverRelativePath = getSharepointServerRelativePathFromURL(url);
        if (serverRelativePath) {
            const files = await getSharepointFiles(server, serverRelativePath, false);
            for (const { path, name, drive, item } of files) {
                if (name.endsWith(".b") || name.endsWith(".fluid")) {
                    console.log(`File: ${path}/${name}`);
                    await fluidFetchOneFile(`https://${server}/_api/v2.1/drives/${drive}/items/${item}`, name);
                }
            }
            return;
        }
    }

    return fluidFetchOneFile(paramURL);
}

parseArguments();

// eslint-disable-next-line @typescript-eslint/no-floating-promises
fluidFetchMain()
    .catch((error: Error) => {
        if (error instanceof Error) {
            let extraMsg = "";
            for (const key of Object.keys(error)) {
                if (key !== "message" && key !== "stack") {
                    extraMsg += `\n${key}: ${JSON.stringify(error[key], undefined, 2)}`;
                }
            }
            console.error(`ERROR: ${error.stack}${extraMsg}`);
        } else if (typeof error === "object") {
            console.error(`ERROR: Unknown exception object\n${JSON.stringify(error, undefined, 2)}`);
        } else {
            console.error(`ERROR: ${error}`);
        }
    })
    .then(() => process.exit(0));

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import util from "util";
import { isSharepointURL, IOdspDriveItem } from "@fluidframework/odsp-doclib-utils";
import { paramSaveDir, paramURL, parseArguments } from "./fluidFetchArgs";
import { connectionInfo, fluidFetchInit } from "./fluidFetchInit";
import { fluidFetchMessages } from "./fluidFetchMessages";
import { getSharepointFiles, getSingleSharePointFile } from "./fluidFetchSharePoint";
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

async function tryFluidFetchOneSharePointFile(server: string, driveItem: IOdspDriveItem) {
    const { path, name, drive, item } = driveItem;
    console.log(`File: ${path}/${name}`);
    await fluidFetchOneFile(`https://${server}/_api/v2.1/drives/${drive}/items/${item}`, name);
}

function getSharePointSpecificDriveItem(url: URL): { drive: string; item: string } | undefined {
    if (url.searchParams.has("driveId") && url.searchParams.has("itemId")) {
        return {
            drive: url.searchParams.get("driveId") as string,
            item: url.searchParams.get("itemId") as string,
        };
    }
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
        // See if the url already has the specific item
        const driveItem = getSharePointSpecificDriveItem(url);
        if (driveItem) {
            const file = await getSingleSharePointFile(server, driveItem.drive, driveItem.item);
            await tryFluidFetchOneSharePointFile(server, file);
            return;
        }

        // See if the url given represent a sharepoint directory
        const serverRelativePath = getSharepointServerRelativePathFromURL(url);
        if (serverRelativePath) {
            const files = await getSharepointFiles(server, serverRelativePath, false);
            for (const file of files) {
                if (file.name.endsWith(".b") || file.name.endsWith(".fluid")) {
                    await tryFluidFetchOneSharePointFile(server, file);
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

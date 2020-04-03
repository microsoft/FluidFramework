/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@microsoft/fluid-common-utils";
import { IOdspResolvedUrl } from "./contracts";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { IOdspCache } from "./odspCache";
import { OdspDriverUrlResolver } from "./odspDriverUrlResolver";
import { getWithRetryForTokenRefresh, throwOdspNetworkError } from "./odspUtils";
import { createOdspUrl } from "./createOdspUrl";

export interface INewFileInfo {
    siteUrl: string;
    driveId: string;
    filename: string;
    filePath: string;
    callback?(itemId: string, filename: string): void;
}

export interface IFileCreateResponse {
    siteUrl: string;
    itemId: string;
    filename: string;
    driveId: string;
}

const isInvalidFileName = (fileName: string): boolean => {
    const invalidCharsRegex = /["*/:<>?\\|]+/g;
    return !!fileName.match(invalidCharsRegex);
};

export function getKeyFromFileInfo(fileInfo: INewFileInfo): string {
    return `${fileInfo.siteUrl}:${fileInfo.driveId}:${fileInfo.filePath}:${fileInfo.filename}`;
}

/**
 * Creates new fluid file before returning a real resolved url
 */
export async function createNewFluidFile(
    getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
    newFileInfoP: Promise<INewFileInfo> | undefined,
    cache: IOdspCache,
): Promise<IOdspResolvedUrl> {
    if (!newFileInfoP) {
        throw new Error("Odsp driver needs to create a new file but no newFileInfo supplied");
    }
    const newFileInfo = await newFileInfoP;

    // We don't want to create a new file for different instances of a driver,
    // and we don't know the order of execution of this code by driver instances.
    // The FileUrlRegistry takes care of handling this potential concurrency for us.
    const resultP = cache.fileUrlRegistry.registerfile(
        getKeyFromFileInfo(newFileInfo),
        async () => {
            // Check for valid filename before the request to create file is actually made.
            if (isInvalidFileName(newFileInfo.filename)) {
                throw new Error("Invalid filename. Please try again.");
            }

            const fileResponse: IFileCreateResponse = await createNewFluidFileHelper(newFileInfo, getStorageToken);
            const odspUrl = createOdspUrl(fileResponse.siteUrl, fileResponse.driveId, fileResponse.itemId, "/");
            const resolver = new OdspDriverUrlResolver();
            const resolvedUrl = await resolver.resolve({ url: odspUrl });

            return [resolvedUrl, fileResponse];
        },
    );

    {
        const [resolvedUrl, fileResponse] = await resultP;
        if (newFileInfo.callback) {
            newFileInfo.callback(fileResponse.itemId, fileResponse.filename);
        }

        return resolvedUrl;
    }
}

/**
 * Creates a new fluid file. '.fluid' is appended to the filename
 */
async function createNewFluidFileHelper(
    newFileInfo: INewFileInfo,
    getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
): Promise<IFileCreateResponse> {
    const fileResponse = await getWithRetryForTokenRefresh(async (refresh: boolean) => {
        const storageToken = await getStorageToken(newFileInfo.siteUrl, refresh);

        const encodedFilename = encodeURIComponent(`${newFileInfo.filename}.fluid`);

        const initialUrl =
            `${newFileInfo.siteUrl}/_api/v2.1/drives/${newFileInfo.driveId}/items/root:/${encodeURIComponent(
                newFileInfo.filePath,
            )}/${encodedFilename}:/content?@name.conflictBehavior=rename&select=id,name,parentReference`;
        const { url, headers } = getUrlAndHeadersWithAuth(initialUrl, storageToken);

        const fetchResponse = await fetch(url, {
            method: "PUT",
            headers,
        });

        if (fetchResponse.status !== 201) {
            // We encounter status=-1 if url path including filename length exceeds 400 characters.
            if (fetchResponse.status === -1) {
                throwOdspNetworkError("Unknown Error. File path length exceeding 400 characters could cause this error",
                    fetchResponse.status, false);
            }

            throwOdspNetworkError("Failed to create file", fetchResponse.status, true);
        }

        const item = await fetchResponse.json();
        if (!item || !item.id) {
            throwOdspNetworkError("Could not parse drive item from Vroom response", fetchResponse.status, false);
        }
        return { itemId: item.id, siteUrl: newFileInfo.siteUrl, driveId: newFileInfo.driveId, filename: item.name };
    });
    return fileResponse;
}

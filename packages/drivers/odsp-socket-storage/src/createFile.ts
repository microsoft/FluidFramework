/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FileMode } from "@microsoft/fluid-driver-definitions";
import { IOdspResolvedUrl } from "./contracts";
import { OdspCache } from "./odspCache";
import { createOdspUrl, OdspDriverUrlResolver } from "./OdspDriverUrlResolver";
import { throwOdspNetworkError } from "./OdspUtils";

export interface INewFileInfo {
    siteUrl: string;
    driveId: string;
    filename: string;
    filePath: string;
    callback?(itemId: string, filename: string): void;
}

const isInvalidFileName = (fileName: string): boolean => {
    const invalidCharsRegex = /["*/:<>?\\|]+/g;
    return !!fileName.match(invalidCharsRegex);
};

export function getKeyFromFileInfo(fileInfo: INewFileInfo): string {
    return `${fileInfo.siteUrl}${fileInfo.driveId}${fileInfo.filePath}${fileInfo.filename}`;
}

/**
 * @param url - Url to be rtesolved based on mode flag.
 * @param getStorageToken - Api to generate storage token.
 * @param newFileInfoPromise - Promise with information necessary to create a new file. New file is not created until this promise resolves.
 * @param fileInfoToCreateNewResponseCache - This caches response of new file creation.
 */
export async function getOdspResolvedUrl(
    url: IOdspResolvedUrl,
    getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
    newFileInfoPromise: Promise<INewFileInfo> | undefined,
    fileInfoToCreateNewResponseCache: OdspCache): Promise<IOdspResolvedUrl> {
    if (url.mode !== FileMode.CREATE_NEW) {
        return Promise.resolve(url);
    }
    const resolvedUrl: IOdspResolvedUrl = await createFileIfNeeded(url, getStorageToken, newFileInfoPromise, fileInfoToCreateNewResponseCache).catch((error) => {
        throw error;
    });
    return resolvedUrl;
}

// TODO: For now we assume that the file will be created before we create the document service. This will be changed
// when we have the ability to boot without a file
/**
 * Checks if the resolveUrl we are getting is fluid-new and creates a new file before returning a real resolved url
 */
async function createFileIfNeeded(
    url: IOdspResolvedUrl,
    getStorageToken: (siteUrl: string, refresh: boolean) => Promise<string | null>,
    newFileInfoPromise: Promise<INewFileInfo> | undefined,
    fileInfoToCreateNewResponseCache: OdspCache): Promise<IOdspResolvedUrl> {
    if (url.mode === FileMode.CREATE_NEW) {
        if (!newFileInfoPromise) {
            throw new Error ("Odsp driver needs to create a new file but no newFileInfo supplied");
        }
        const newFileInfo = await newFileInfoPromise;
        const storageToken = await getStorageToken(newFileInfo.siteUrl, false);
        const file = await createNewFluidFile(newFileInfo, storageToken, fileInfoToCreateNewResponseCache);
        if (newFileInfo.callback) {
            newFileInfo.callback(file.itemId, file.filename);
        }
        const odspUrl = createOdspUrl(file.siteUrl, file.driveId, file.itemId, "/");
        const resolver = new OdspDriverUrlResolver();
        const resolvedUrl = await resolver.resolve({url: odspUrl});
        if (resolvedUrl.mode === FileMode.CREATE_NEW) {
            throw new Error("Failed to resolve URL after creating new file");
        }
        return resolvedUrl;
    }
    return url;
}

/**
 * Creates a new fluid file. '.fluid' is appended to the filename
 */
export async function createNewFluidFile(
    newFileInfo: INewFileInfo,
    storageToken: string | null,
    fileInfoToCreateNewResponseCache: OdspCache,
): Promise<{driveId: string, itemId: string, siteUrl: string, filename: string}> {

    const key = getKeyFromFileInfo(newFileInfo);
    const response = fileInfoToCreateNewResponseCache.get(key);
    if (response !== undefined) {
        return {itemId: response.id, siteUrl: newFileInfo.siteUrl, driveId: newFileInfo.driveId, filename: response.name};
    }
    // Check for valid filename
    // Adding invalid filename check here for another sanity pass before the request to create file is actually made
    if (isInvalidFileName(newFileInfo.filename)) {
        throw new Error("Invalid filename. Please try again.");
    }

    const encodedFilename = encodeURIComponent(`${newFileInfo.filename}.fluid`);

    const url = `${newFileInfo.siteUrl}/_api/v2.1/drives/${newFileInfo.driveId}/items/root:/${encodeURIComponent(
        newFileInfo.filePath,
    )}/${encodedFilename}:/content?@name.conflictBehavior=rename&select=id,name,parentReference`;
    const headers = storageToken ? { Authorization: `Bearer ${storageToken}` } : undefined;
    const fetchResponse = await fetch(url, {
        method: "PUT",
        headers,
    });

    if (fetchResponse.status !== 201) {
        // We encounter status=-1 if url path including filename length exceeds 400 characters.
        if (fetchResponse.status === -1) {
            throwOdspNetworkError("Unknown Error. File path length exceeding 400 characters could cause this error", fetchResponse.status, false);
        }

        throwOdspNetworkError("Failed to create file", fetchResponse.status, true);
    }

    const item = await fetchResponse.json();
    if (!item || !item.id) {
        throwOdspNetworkError("Could not parse drive item from Vroom response", fetchResponse.status, false);
    }

    fileInfoToCreateNewResponseCache.put(key, item);
    return {itemId: item.id, siteUrl: newFileInfo.siteUrl, driveId: newFileInfo.driveId, filename: item.name};
}

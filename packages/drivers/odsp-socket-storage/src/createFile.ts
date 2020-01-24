/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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

/**
 * Creates a new fluid file. '.fluid' is appended to the filename
 */
export async function createNewFluidFile(
    newFileInfo: INewFileInfo,
    storageToken: string | null,
): Promise<{driveId: string, itemId: string, siteUrl: string, filename: string}> {
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
            throw new Error("File path length exceeds 400 characters. Please use shorter filename.");
        }

        throw new Error(`${fetchResponse.status} Failed to create file`);
    }

    const item = await fetchResponse.json();
    if (!item || !item.id) {
        throw new Error("Could not parse drive item from Vroom response");
    }

    return {itemId: item.id, siteUrl: newFileInfo.siteUrl, driveId: newFileInfo.driveId, filename: item.name};
}

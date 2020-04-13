/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    getAsync,
    createErrorFromResponse,
    putAsync,
    IOdspAuthRequestInfo,
} from "./odspRequest";

interface IOdspUser {
    displayName: string;
    email?: string;
    id?: string;
}

interface IOdspGroup {
    displayName: string;
    email?: string;
}

interface IOdspDriveQuota {
    deleted: number;
    fileCount: number;
    remaining: number;
    state: string;
    total: number;
    used: number;
}

interface IOdspEntity {
    user?: IOdspUser;
    group?: IOdspGroup;
}

interface IOdspDriveInfo {
    id: string;
    createdDateTime: string;
    description: string;
    driveType: string;
    lastModifiedDateTime: string;
    name: string;
    webUrl: string;
    createdBy: IOdspEntity;
    lastModifiedBy: IOdspEntity;
    owner: IOdspEntity;
    quota: IOdspDriveQuota;
}

export interface IOdspDriveItem {
    path: string;
    name: string;
    drive: string;
    item: string;
    isFolder: boolean;
}

export async function getDriveItemByRootFileName(
    server: string,
    account: string,
    path: string,
    authRequestInfo: IOdspAuthRequestInfo,
    create: boolean,
): Promise<IOdspDriveItem> {
    const accountPath = account ? `/${account}` : "";
    const getDriveItemUrl = `https://${server}${accountPath}/_api/v2.1/drive/root:${path}:`;
    return getDriveItem(getDriveItemUrl, authRequestInfo, create);
}

export async function getDriveItemByServerRelativePath(
    server: string,
    serverRelativePath: string,
    authRequestInfo: IOdspAuthRequestInfo,
    create: boolean,
): Promise<IOdspDriveItem> {
    let account = "";
    const pathParts = serverRelativePath.split("/");
    if (serverRelativePath.startsWith("/")) {
        pathParts.shift();
    }
    if (pathParts.length === 0) {
        return Promise.reject(new Error(`Invalid serverRelativePath ${serverRelativePath}`));
    }
    if (pathParts.length >= 2 &&
        (pathParts[0] === "personal" || pathParts[0] === "teams" || pathParts[0] === "sites")) {
        account = `${pathParts.shift()}/${pathParts.shift()}`;
    }

    const library = pathParts.shift();
    if (!library) {
        // Default drive/library
        return getDriveItemByRootFileName(server, account, "/", authRequestInfo, create);
    }
    const path = `/${pathParts.join("/")}`;
    const driveId = await getDriveId(server, account, library, authRequestInfo);
    const getDriveItemUrl = `https://${server}/_api/v2.1/drives/${driveId}/root:${path}:`;
    return getDriveItem(getDriveItemUrl, authRequestInfo, create);
}

export async function getChildrenByDriveItem(
    driveItem: IOdspDriveItem,
    server: string,
    authRequestInfo: IOdspAuthRequestInfo,
): Promise<IOdspDriveItem[]> {
    if (!driveItem.isFolder) { return []; }
    let url = `https://${server}/_api/v2.1/drives/${driveItem.drive}/items/${driveItem.item}/children`;
    let children: any[] = [];
    do {
        const getChildrenResult = await getAsync(url, authRequestInfo);
        if (getChildrenResult.status !== 200) {
            throw createErrorFromResponse("Unable to get children", getChildrenResult);
        }
        children = children.concat(getChildrenResult.data.value);
        url = getChildrenResult.data["@odata.nextLink"];
    } while (url);

    return children.map(toIODSPDriveItem);
}

async function getDriveItem(
    getDriveItemUrl: string,
    authRequestInfo: IOdspAuthRequestInfo,
    create: boolean,
): Promise<IOdspDriveItem> {
    let getDriveItemResult = await getAsync(getDriveItemUrl, authRequestInfo);
    if (getDriveItemResult.status !== 200) {
        if (!create) {
            throw createErrorFromResponse("Unable to get drive/item id from path", getDriveItemResult);
        }

        // Try creating the file
        const contentUri = `${getDriveItemUrl}/content`;
        const createResult = await putAsync(contentUri, authRequestInfo);
        if (createResult.status !== 201) {
            throw createErrorFromResponse("Failed to create file.", createResult);
        }

        getDriveItemResult = await getAsync(getDriveItemUrl, authRequestInfo);
        if (getDriveItemResult.status !== 200) {
            throw createErrorFromResponse("Unable to get drive/item id from path", getDriveItemResult);
        }
    }
    return toIODSPDriveItem(getDriveItemResult.data);
}

async function getDriveId(
    server: string,
    account: string,
    library: string,
    authRequestInfo: IOdspAuthRequestInfo,
): Promise<string> {
    const drives = await getDrives(server, account, authRequestInfo);
    const accountPath = account ? `/${account}` : "";
    const drivePath = encodeURI(`https://${server}${accountPath}/${library}`);
    const index = drives.findIndex((value) => value.webUrl === drivePath);
    if (index === -1) {
        throw Error(`Drive ${drivePath} not found.`);
    }
    return drives[index].id;
}

async function getDrives(
    server: string,
    account: string,
    authRequestInfo: IOdspAuthRequestInfo,
): Promise<IOdspDriveInfo[]> {
    const accountPath = account ? `/${account}` : "";
    const getDriveUrl = `https://${server}${accountPath}/_api/v2.1/drives`;
    const getDriveResult = await getAsync(getDriveUrl, authRequestInfo);
    if (getDriveResult.status !== 200) {
        throw createErrorFromResponse("Failed to get drives.", getDriveResult);
    }
    return getDriveResult.data.value as IOdspDriveInfo[];
}

function toIODSPDriveItem(parsedDriveItemBody: any): IOdspDriveItem {
    const path = parsedDriveItemBody.parentReference.path ?
        parsedDriveItemBody.parentReference.path.split("root:")[1] : "/";
    return {
        path,
        name: parsedDriveItemBody.name,
        drive: parsedDriveItemBody.parentReference.driveId,
        item: parsedDriveItemBody.id,
        isFolder: !!parsedDriveItemBody.folder,
    };
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IOdspAuthInfo, getAsync, createErrorFromResponse, putAsync, getOdspScope } from "./odspRequest";

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
    account: string,
    path: string,
    authInfo: IOdspAuthInfo,
    create: boolean,
): Promise<IOdspDriveItem> {
    const accountPath = account ? `/${account}` : "";
    const getDriveItemUrl = `https://${authInfo.server}${accountPath}/_api/v2.1/drive/root:${path}:`;
    return getDriveItem(getDriveItemUrl, authInfo, create);
}

export async function getDriveItemByServerRelativePath(
    serverRelativePath: string,
    authInfo: IOdspAuthInfo,
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
        return getDriveItemByRootFileName(account, "/", authInfo, create);
    }
    const path = `/${pathParts.join("/")}`;
    const driveId = await getDriveId(account, library, authInfo);
    const getDriveItemUrl = `https://${authInfo.server}/_api/v2.1/drives/${driveId}/root:${path}:`;
    return getDriveItem(getDriveItemUrl, authInfo, create);
}

export async function getChildrenByDriveItem(
    driveItem: IOdspDriveItem,
    authInfo: IOdspAuthInfo,
): Promise<IOdspDriveItem[]> {
    if (!driveItem.isFolder) { return []; }
    let url = `https://${authInfo.server}/_api/v2.1/drives/${driveItem.drive}/items/${driveItem.item}/children`;
    let children: any[] = [];
    do {
        const getChildrenResult = await getAsync(url, authInfo, getOdspScope(authInfo.server));
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
    authInfo: IOdspAuthInfo,
    create: boolean,
): Promise<IOdspDriveItem> {
    let getDriveItemResult = await getAsync(getDriveItemUrl, authInfo, getOdspScope(authInfo.server));
    if (getDriveItemResult.status !== 200) {
        if (!create) {
            throw createErrorFromResponse("Unable to get drive/item id from path", getDriveItemResult);
        }

        // Try creating the file
        const contentUri = `${getDriveItemUrl}/content`;
        const createResult = await putAsync(contentUri, authInfo, getOdspScope(authInfo.server));
        if (createResult.status !== 201) {
            throw createErrorFromResponse("Failed to create file.", createResult);
        }

        getDriveItemResult = await getAsync(getDriveItemUrl, authInfo, getOdspScope(authInfo.server));
        if (getDriveItemResult.status !== 200) {
            throw createErrorFromResponse("Unable to get drive/item id from path", getDriveItemResult);
        }
    }
    return toIODSPDriveItem(getDriveItemResult.data);
}

async function getDriveId(account: string, library: string, authInfo: IOdspAuthInfo): Promise<string> {
    const drives = await getDrives(account, authInfo);
    const accountPath = account ? `/${account}` : "";
    const drivePath = encodeURI(`https://${authInfo.server}${accountPath}/${library}`);
    const index = drives.findIndex((value) => value.webUrl === drivePath);
    if (index === -1) {
        throw Error(`Drive ${drivePath} not found.`);
    }
    return drives[index].id;
}

async function getDrives(account: string, authInfo: IOdspAuthInfo): Promise<IOdspDriveInfo[]> {
    const accountPath = account ? `/${account}` : "";
    const getDriveUrl = `https://${authInfo.server}${accountPath}/_api/v2.1/drives`;
    const getDriveResult = await getAsync(getDriveUrl, authInfo, getOdspScope(authInfo.server));
    if (getDriveResult.status !== 200) {
        throw createErrorFromResponse("Failed to get drives.", getDriveResult);
    }
    return getDriveResult.data as IOdspDriveInfo[];
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

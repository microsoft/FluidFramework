/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IOdspAuthRequestInfo } from "./odspAuth";
import { throwOdspNetworkError } from "./odspErrorUtils";
import { getAsync, putAsync } from "./odspRequest";

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
    account: string | undefined,
    path: string,
    authRequestInfo: IOdspAuthRequestInfo,
    create: boolean,
    driveId?: string,
): Promise<IOdspDriveItem> {
    const accountPath = account !== undefined ? `/${account}` : "";
    let getDriveItemUrl;
    if (driveId !== undefined && driveId !== "") {
        const encodedDrive = encodeURIComponent(driveId);
        getDriveItemUrl = `https://${server}${accountPath}/_api/v2.1/drives/${encodedDrive}/root:${path}:`;
    } else {
        getDriveItemUrl = `https://${server}${accountPath}/_api/v2.1/drive/root:${path}:`;
    }
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

export async function getDriveItemFromDriveAndItem(
    server: string,
    drive: string,
    item: string,
    authRequestInfo: IOdspAuthRequestInfo,
): Promise<IOdspDriveItem> {
    const url = `https://${server}/_api/v2.1/drives/${drive}/items/${item}`;
    return getDriveItem(url, authRequestInfo, false);
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
        const response = await getAsync(url, authRequestInfo);
        if (response.status !== 200) {
            throwOdspNetworkError("Unable to get children", response.status, response);
        }
        const getChildrenResult = await response.json();
        children = children.concat(getChildrenResult.value);
        url = getChildrenResult["@odata.nextLink"];
    } while (url);

    return children.map(toIODSPDriveItem);
}

async function getDriveItem(
    getDriveItemUrl: string,
    authRequestInfo: IOdspAuthRequestInfo,
    create: boolean,
): Promise<IOdspDriveItem> {
    let response = await getAsync(getDriveItemUrl, authRequestInfo);
    if (response.status !== 200) {
        if (!create) {
            throwOdspNetworkError("Unable to get drive/item id from path", response.status, response);
        }

        // Try creating the file
        const contentUri = `${getDriveItemUrl}/content`;
        const createResultResponse = await putAsync(contentUri, authRequestInfo);
        if (createResultResponse.status !== 201) {
            throwOdspNetworkError("Failed to create file.", createResultResponse.status, createResultResponse);
        }

        response = await getAsync(getDriveItemUrl, authRequestInfo);
        if (response.status !== 200) {
            throwOdspNetworkError("Unable to get drive/item id from path", response.status, response);
        }
    }
    const getDriveItemResult = await response.json();
    return toIODSPDriveItem(getDriveItemResult);
}

export async function getDriveId(
    server: string,
    account: string,
    library: string | undefined,
    authRequestInfo: IOdspAuthRequestInfo,
): Promise<string> {
    if (library === undefined)
    {
        const drive = await getDefaultDrive(server, account, authRequestInfo);
        return drive.id;
    }
    const drives = await getDrives(server, account, authRequestInfo);
    const accountPath = account ? `/${account}` : "";
    const drivePath = encodeURI(`https://${server}${accountPath}/${library}`);
    const index = drives.findIndex((value) => value.webUrl === drivePath);
    if (index === -1) {
        throw Error(`Drive ${drivePath} not found.`);
    }
    return drives[index].id;
}

async function getDefaultDrive(
    server: string,
    account: string,
    authRequestInfo: IOdspAuthRequestInfo,
): Promise<IOdspDriveInfo> {
    const response = await getDriveResponse("drive", server, account, authRequestInfo);
    const getDriveResult = await response.json();
    return getDriveResult as IOdspDriveInfo;
}

async function getDrives(
    server: string,
    account: string,
    authRequestInfo: IOdspAuthRequestInfo,
): Promise<IOdspDriveInfo[]> {
    const response = await getDriveResponse("drives", server, account, authRequestInfo);
    const getDriveResult = await response.json();
    return getDriveResult.value as IOdspDriveInfo[];
}

async function getDriveResponse(
    routeTail: "drive" | "drives",
    server: string,
    account: string,
    authRequestInfo: IOdspAuthRequestInfo,
) {
    const accountPath = account ? `/${account}` : "";
    const getDriveUrl = `https://${server}${accountPath}/_api/v2.1/${routeTail}`;
    const response = await getAsync(getDriveUrl, authRequestInfo);
    if (response.status !== 200) {
        throwOdspNetworkError(`Failed to get ${routeTail}.`, response.status, response);
    }
    return response;
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

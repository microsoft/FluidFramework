/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { throwOdspNetworkError } from "./odspErrorUtils";
import { getAsync, putAsync } from "./odspRequest";
export async function getDriveItemByRootFileName(server, account, path, authRequestInfo, create, driveId) {
    const accountPath = account !== undefined ? `/${account}` : "";
    let getDriveItemUrl;
    if (driveId !== undefined && driveId !== "") {
        const encodedDrive = encodeURIComponent(driveId);
        getDriveItemUrl = `https://${server}${accountPath}/_api/v2.1/drives/${encodedDrive}/root:${path}:`;
    }
    else {
        getDriveItemUrl = `https://${server}${accountPath}/_api/v2.1/drive/root:${path}:`;
    }
    return getDriveItem(getDriveItemUrl, authRequestInfo, create);
}
export async function getDriveItemByServerRelativePath(server, serverRelativePath, authRequestInfo, create) {
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
export async function getDriveItemFromDriveAndItem(server, drive, item, authRequestInfo) {
    const url = `https://${server}/_api/v2.1/drives/${drive}/items/${item}`;
    return getDriveItem(url, authRequestInfo, false);
}
export async function getChildrenByDriveItem(driveItem, server, authRequestInfo) {
    if (!driveItem.isFolder) {
        return [];
    }
    let url = `https://${server}/_api/v2.1/drives/${driveItem.drive}/items/${driveItem.item}/children`;
    let children = [];
    do {
        const response = await getAsync(url, authRequestInfo);
        if (response.status !== 200) {
            throwOdspNetworkError("Unable to get children", response.status);
        }
        const getChildrenResult = await response.json();
        children = children.concat(getChildrenResult.value);
        url = getChildrenResult["@odata.nextLink"];
    } while (url);
    return children.map(toIODSPDriveItem);
}
async function getDriveItem(getDriveItemUrl, authRequestInfo, create) {
    let response = await getAsync(getDriveItemUrl, authRequestInfo);
    if (response.status !== 200) {
        if (!create) {
            throwOdspNetworkError("Unable to get drive/item id from path", response.status);
        }
        // Try creating the file
        const contentUri = `${getDriveItemUrl}/content`;
        const createResultResponse = await putAsync(contentUri, authRequestInfo);
        if (createResultResponse.status !== 201) {
            throwOdspNetworkError("Failed to create file.", createResultResponse.status);
        }
        response = await getAsync(getDriveItemUrl, authRequestInfo);
        if (response.status !== 200) {
            throwOdspNetworkError("Unable to get drive/item id from path", response.status);
        }
    }
    const getDriveItemResult = await response.json();
    return toIODSPDriveItem(getDriveItemResult);
}
async function getDriveId(server, account, library, authRequestInfo) {
    const drives = await getDrives(server, account, authRequestInfo);
    const accountPath = account ? `/${account}` : "";
    const drivePath = encodeURI(`https://${server}${accountPath}/${library}`);
    const index = drives.findIndex((value) => value.webUrl === drivePath);
    if (index === -1) {
        throw Error(`Drive ${drivePath} not found.`);
    }
    return drives[index].id;
}
async function getDrives(server, account, authRequestInfo) {
    const accountPath = account ? `/${account}` : "";
    const getDriveUrl = `https://${server}${accountPath}/_api/v2.1/drives`;
    const response = await getAsync(getDriveUrl, authRequestInfo);
    if (response.status !== 200) {
        throwOdspNetworkError("Failed to get drives.", response.status);
    }
    const getDriveResult = await response.json();
    return getDriveResult.value;
}
function toIODSPDriveItem(parsedDriveItemBody) {
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
//# sourceMappingURL=odspDrives.js.map
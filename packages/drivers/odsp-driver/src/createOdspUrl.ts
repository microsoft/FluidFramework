/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Per https://github.com/microsoft/FluidFramework/issues/1556, isolating createOdspUrl() in its own file.
 */

/**
 * Encodes ODC/SPO information into a URL format that can be handled by the Loader
 * @param siteUrl - The site where the container is hosted
 * @param driveId - The id of the drive with the container
 * @param itemId - The id of the container
 * @param path - A path that corresponds to a request that will be handled by the container
 */
export function createOdspUrl(siteUrl: string, driveId: string, itemId: string, path: string): string {
    return `${siteUrl}?driveId=${encodeURIComponent(driveId)}&itemId=${encodeURIComponent(
        itemId,
    )}&path=${encodeURIComponent(path)}`;
}

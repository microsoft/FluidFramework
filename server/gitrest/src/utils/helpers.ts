/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PathLike, Stats } from "fs";
import { IGetRefParamsExternal, IWholeFlatSummary, NetworkError } from "@fluidframework/server-services-client";
import { IExternalWriterConfig, IFileSystemManager } from "./definitions";

/**
 * Validates that the input encoding is valid
 */
 export function validateBlobEncoding(encoding: BufferEncoding): boolean {
    return encoding === "utf-8" || encoding === "base64";
}

/**
 * Validates blob content exists
 */
export function validateBlobContent(content: string): boolean {
    return content !== undefined && content !== null;
}

/**
 * Helper function to decode externalstorage read params
 */
export function getExternalWriterParams(params: string | undefined): IExternalWriterConfig | undefined {
    if (params) {
        const getRefParams: IGetRefParamsExternal = JSON.parse(decodeURIComponent(params));
        return getRefParams.config;
    }
    return undefined;
}

export async function exists(
    fileSystemManager: IFileSystemManager,
    fileOrDirectoryPath: PathLike,
): Promise<Stats | false> {
    try {
        const fileOrDirectoryStats = await fileSystemManager.stat(fileOrDirectoryPath);
        return fileOrDirectoryStats;
    } catch (error) {
        if (error?.code === "ENOENT") {
            // File/Directory does not exist.
            return false;
        }
        throw error;
    }
}

const latestFullSummaryFilename = "latestFullSummary";
const getLatestFullSummaryFilePath = (dir: string) => `${dir}/${latestFullSummaryFilename}`;

export async function persistLatestFullSummaryInStorage(
    fileSystemManager: IFileSystemManager,
    storageDirectoryPath: string,
    latestFullSummary: IWholeFlatSummary,
): Promise<void> {
    const directoryExists = await exists(fileSystemManager, storageDirectoryPath);
    if (directoryExists === false) {
        await fileSystemManager.mkdir(storageDirectoryPath, { recursive: true });
    } else if (!directoryExists.isDirectory()) {
        throw new NetworkError(400, "Document storage directory path is not a directory");
    }
    await fileSystemManager.writeFile(
        getLatestFullSummaryFilePath(storageDirectoryPath),
        JSON.stringify(latestFullSummary),
    );
}

export async function retrieveLatestFullSummaryFromStorage(
    fileSystemManager: IFileSystemManager,
    storageDirectoryPath: string,
): Promise<IWholeFlatSummary | undefined> {
    try {
        const summaryFile = await fileSystemManager.readFile(
            getLatestFullSummaryFilePath(storageDirectoryPath),
        );
        // TODO: This will be converted back to a JSON string for the HTTP response
        const summary: IWholeFlatSummary = JSON.parse(summaryFile.toString());
        return summary;
    } catch (error) {
        if (error?.code === "ENOENT") {
            // File does not exist.
            return undefined;
        }
        throw error;
    }
}

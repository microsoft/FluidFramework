/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PathLike, Stats } from "fs";
import * as path from "path";
import { Request } from "express";
import { IGetRefParamsExternal, IWholeFlatSummary, NetworkError } from "@fluidframework/server-services-client";
import { Constants, IExternalWriterConfig, IFileSystemManager, IRepoManagerParams } from "./definitions";

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

export function getRepoManagerParamsFromRequest(request: Request): IRepoManagerParams {
    const storageName: string | undefined = request.get(Constants.StorageNameHeader);
    return {
        repoOwner: request.params.owner,
        repoName: request.params.repo,
        fileSystemManagerParams: {
            storageName,
        },
    };
}

export async function exists(
    fileSystemManager: IFileSystemManager,
    fileOrDirectoryPath: PathLike,
): Promise<Stats | false> {
    try {
        const fileOrDirectoryStats = await fileSystemManager.promises.stat(fileOrDirectoryPath);
        return fileOrDirectoryStats;
    } catch (error: any) {
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
        await fileSystemManager.promises.mkdir(storageDirectoryPath, { recursive: true });
    } else if (!directoryExists.isDirectory()) {
        throw new NetworkError(400, "Document storage directory path is not a directory");
    }
    await fileSystemManager.promises.writeFile(
        getLatestFullSummaryFilePath(storageDirectoryPath),
        JSON.stringify(latestFullSummary),
    );
}

export async function retrieveLatestFullSummaryFromStorage(
    fileSystemManager: IFileSystemManager,
    storageDirectoryPath: string,
): Promise<IWholeFlatSummary | undefined> {
    try {
        const summaryFile = await fileSystemManager.promises.readFile(
            getLatestFullSummaryFilePath(storageDirectoryPath),
        );
        // TODO: This will be converted back to a JSON string for the HTTP response
        const summary: IWholeFlatSummary = JSON.parse(summaryFile.toString());
        return summary;
    } catch (error: any) {
        if (error?.code === "ENOENT") {
            // File does not exist.
            return undefined;
        }
        throw error;
    }
}

/**
 * Retrieves the full repository path. Or throws an error if not valid.
 */
export function getRepoPath(name: string, owner?: string): string {
    // `name` needs to be always present and valid.
    if (!name || path.parse(name).dir !== "") {
        throw new NetworkError(400, `Invalid repo name provided.`);
    }

    // When `owner` is present, it needs to be valid.
    if (owner && path.parse(owner).dir !== "") {
        throw new NetworkError(400, `Invalid repo owner provided.`);
    }

    return owner ? `${owner}/${name}` : name;
}

export function getGitDirectory(repoPath: string, baseDir?: string): string {
    return baseDir ? `${baseDir}/${repoPath}` : repoPath;
}

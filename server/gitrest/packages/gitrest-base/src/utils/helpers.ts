/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PathLike, Stats } from "fs";
import * as path from "path";
import { Request } from "express";
import {
    IGetRefParamsExternal,
    IWholeFlatSummary,
    isNetworkError,
    NetworkError,
} from "@fluidframework/server-services-client";
import { BaseTelemetryProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import {
    BaseGitRestTelemetryProperties,
    Constants,
    IExternalWriterConfig,
    IFileSystemManager,
    IRepoManagerParams,
    IStorageRoutingId,
} from "./definitions";

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
    const storageRoutingId: IStorageRoutingId = parseStorageRoutingId(request.get(Constants.StorageRoutingIdHeader));
    return {
        repoOwner: request.params.owner,
        repoName: request.params.repo,
        storageRoutingId,
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

export function parseStorageRoutingId(storageRoutingId?: string): IStorageRoutingId | undefined {
    if (!storageRoutingId) {
        return undefined;
    }
    const [tenantId,documentId] = storageRoutingId.split(":");
    return {
        tenantId,
        documentId,
    };
}

export function getLumberjackBasePropertiesFromRepoManagerParams(params: IRepoManagerParams) {
    return {
        [BaseTelemetryProperties.tenantId]: params?.storageRoutingId?.tenantId ?? params?.repoName,
        [BaseTelemetryProperties.documentId]: params?.storageRoutingId?.documentId,
        [BaseGitRestTelemetryProperties.repoOwner]: params.repoOwner,
        [BaseGitRestTelemetryProperties.repoName]: params.repoName,
        [BaseGitRestTelemetryProperties.storageName]: params?.fileSystemManagerParams?.storageName,
    };
}

export function getRequestPathCategory(request: Request) {
    return `${request.baseUrl}${request?.route?.path ?? "PATH_UNAVAILABLE"}`;
}

export function logAndThrowApiError(error: any, request: Request, params: IRepoManagerParams): never {
    const pathCategory = getRequestPathCategory(request);
    const lumberjackProperties = {
        ...getLumberjackBasePropertiesFromRepoManagerParams(params),
        [BaseGitRestTelemetryProperties.method]: request.method,
        [BaseGitRestTelemetryProperties.pathCategory]: pathCategory,
    };
    Lumberjack.error(`${request.method} request to ${pathCategory} failed`, lumberjackProperties, error);

    if (isNetworkError(error)) {
        throw error;
    }
    // TODO: some APIs might expect 400 responses by default, like GetRef in GitManager. Since `handleResponse` uses
    // 400 by default, using something different here would override the expected behavior and cause issues. Because
    // of that, for now, we use 400 here. But ideally, we would revisit every RepoManager API and make sure that API
    // is actively throwing NetworkErrors with appropriate status codes according to what the protocols expect.
    throw new NetworkError(400, `Error when processing ${request.method} request to ${request.url}`);
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PathLike, Stats, type BigIntStats } from "fs";
import * as path from "path";
import { Request } from "express";
import {
	IGetRefParamsExternal,
	IWholeFlatSummary,
	isNetworkError,
	NetworkError,
} from "@fluidframework/server-services-client";
import {
	BaseTelemetryProperties,
	HttpProperties,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";
import {
	Constants,
	IExternalWriterConfig,
	IFileSystemManager,
	IFileSystemManagerFactories,
	IRepoManagerParams,
	IRepositoryManagerFactory,
	IStorageRoutingId,
} from "./definitions";
import {
	BaseGitRestTelemetryProperties,
	GitRestLumberEventName,
} from "./gitrestTelemetryDefinitions";
import { isFilesystemError, throwFileSystemErrorAsNetworkError } from "./fileSystemHelper";

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
 * Returns the fsManagerFactory based on the isEphemeral flag
 */
export function getFilesystemManagerFactory(
	fileSystemManagerFactories: IFileSystemManagerFactories,
	isEphemeralContainer: boolean,
) {
	return isEphemeralContainer && fileSystemManagerFactories.ephemeralFileSystemManagerFactory
		? fileSystemManagerFactories.ephemeralFileSystemManagerFactory
		: fileSystemManagerFactories.defaultFileSystemManagerFactory;
}

/**
 * Helper function to decode externalstorage read params
 */
export function getExternalWriterParams(
	params: string | undefined,
): IExternalWriterConfig | undefined {
	if (params) {
		const getRefParams: IGetRefParamsExternal = JSON.parse(decodeURIComponent(params));
		return getRefParams.config;
	}
	return undefined;
}

export function getRepoManagerParamsFromRequest(request: Request): IRepoManagerParams {
	const storageName: string | undefined = request.get(Constants.StorageNameHeader);
	const storageRoutingId = parseStorageRoutingId(request.get(Constants.StorageRoutingIdHeader));

	const isEphemeralFromRequest = request.get(Constants.IsEphemeralContainer);

	const isEphemeralContainer: boolean =
		isEphemeralFromRequest === undefined ? false : isEphemeralFromRequest === "true";

	return {
		repoOwner: request.params.owner,
		repoName: request.params.repo,
		storageRoutingId,
		fileSystemManagerParams: {
			storageName,
		},
		isEphemeralContainer,
	};
}

export async function exists(
	fileSystemManager: IFileSystemManager,
	fileOrDirectoryPath: PathLike,
): Promise<Stats | BigIntStats | false> {
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
	lumberjackProperties: Record<string, any>,
): Promise<void> {
	const persistLatestFullSummaryInStorageMetric = Lumberjack.newLumberMetric(
		GitRestLumberEventName.PersistLatestFullSummaryInStorage,
		lumberjackProperties,
	);
	try {
		const directoryExists = await exists(fileSystemManager, storageDirectoryPath);
		persistLatestFullSummaryInStorageMetric.setProperty(
			BaseGitRestTelemetryProperties.fullSummaryDirectoryExists,
			directoryExists !== false,
		);
		if (directoryExists === false) {
			await fileSystemManager.promises.mkdir(storageDirectoryPath, { recursive: true });
		} else if (!directoryExists.isDirectory()) {
			throw new NetworkError(400, "Document storage directory path is not a directory");
		}
		await fileSystemManager.promises.writeFile(
			getLatestFullSummaryFilePath(storageDirectoryPath),
			JSON.stringify(latestFullSummary),
		);
		persistLatestFullSummaryInStorageMetric.success(
			"Successfully persisted latest full summary in storage",
		);
	} catch (error: unknown) {
		persistLatestFullSummaryInStorageMetric.error(
			"Failed to persist latest full summary in storage",
			error,
		);
		if (isFilesystemError(error)) {
			throwFileSystemErrorAsNetworkError(error);
		}
		throw error;
	}
}

export async function retrieveLatestFullSummaryFromStorage(
	fileSystemManager: IFileSystemManager,
	storageDirectoryPath: string,
	lumberjackProperties: Record<string, any>,
): Promise<IWholeFlatSummary | undefined> {
	const retrieveLatestFullSummaryMetric = Lumberjack.newLumberMetric(
		GitRestLumberEventName.RetrieveLatestFullSummaryFromStorage,
		lumberjackProperties,
	);
	try {
		const summaryFile = await fileSystemManager.promises.readFile(
			getLatestFullSummaryFilePath(storageDirectoryPath),
		);
		// TODO: This will be converted back to a JSON string for the HTTP response
		const summary: IWholeFlatSummary = JSON.parse(summaryFile.toString());
		retrieveLatestFullSummaryMetric.setProperty(
			BaseGitRestTelemetryProperties.emptyFullSummary,
			false,
		);
		retrieveLatestFullSummaryMetric.success("Successfully read full summary from storage");
		return summary;
	} catch (error: any) {
		if (error?.code === "ENOENT") {
			retrieveLatestFullSummaryMetric.setProperty(
				BaseGitRestTelemetryProperties.emptyFullSummary,
				true,
			);
			retrieveLatestFullSummaryMetric.success(
				"Tried to retrieve latest from summary from storage but it does not exist",
			);
			// File does not exist.
			return undefined;
		}
		retrieveLatestFullSummaryMetric.error(
			"Failed to read latest full summary from storage",
			error,
		);
		throw error;
	}
}

/**
 * Retrieves the full repository path. Or throws an error if not valid.
 */
export function getRepoPath(tenantId: string, documentId?: string, owner?: string): string {
	// `tenantId` needs to be always present and valid.
	if (!tenantId || path.parse(tenantId).dir !== "") {
		throw new NetworkError(400, `Invalid repo name (tenantId) provided: ${tenantId}`);
	}

	// When `owner` is present, it needs to be valid.
	if (owner && path.parse(owner).dir !== "") {
		throw new NetworkError(400, `Invalid repo owner provided: ${owner}`);
	}

	// When `documentId` is present, it needs to be valid.
	if (documentId && path.parse(documentId).dir !== "") {
		throw new NetworkError(400, `Invalid repo name (documentId) provided: ${documentId}`);
	}

	return [owner, tenantId, documentId].filter((x) => x !== undefined).join("/");
}

export function getGitDirectory(repoPath: string, baseDir?: string, suffixPath?: string): string {
	return [baseDir, repoPath, suffixPath].filter((x) => x !== undefined).join("/");
}

export function parseStorageRoutingId(storageRoutingId?: string): IStorageRoutingId | undefined {
	if (!storageRoutingId) {
		return undefined;
	}
	const [tenantId, documentId] = storageRoutingId.split(":");
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
		[BaseGitRestTelemetryProperties.isEphemeralContainer]: params?.isEphemeralContainer,
	};
}

export function getRequestPathCategory(request: Request) {
	return `${request.baseUrl}${request?.route?.path ?? "PATH_UNAVAILABLE"}`;
}

export function logAndThrowApiError(
	error: any,
	request: Request,
	params: IRepoManagerParams,
): never {
	const pathCategory = getRequestPathCategory(request);
	const lumberjackProperties = {
		...getLumberjackBasePropertiesFromRepoManagerParams(params),
		[HttpProperties.method]: request.method,
		[HttpProperties.pathCategory]: pathCategory,
	};
	Lumberjack.error(
		`${request.method} request to ${pathCategory} failed`,
		lumberjackProperties,
		error,
	);

	if (isNetworkError(error)) {
		throw error;
	}
	if (isFilesystemError(error)) {
		throwFileSystemErrorAsNetworkError(error);
	}
	// TODO: some APIs might expect 400 responses by default, like GetRef in GitManager. Since `handleResponse` uses
	// 400 by default, using something different here would override the expected behavior and cause issues. Because
	// of that, for now, we use 400 here. But ideally, we would revisit every RepoManager API and make sure that API
	// is actively throwing NetworkErrors with appropriate status codes according to what the protocols expect.
	throw new NetworkError(
		400,
		`Error when processing ${request.method} request to ${request.url}`,
	);
}

export async function getRepoManagerFromWriteAPI(
	repoManagerFactory: IRepositoryManagerFactory,
	repoManagerParams: IRepoManagerParams,
	repoPerDocEnabled: boolean,
	optimizeForInitialSummary?: boolean,
) {
	if (optimizeForInitialSummary) {
		return repoManagerFactory.create({ ...repoManagerParams, optimizeForInitialSummary });
	}
	try {
		return await repoManagerFactory.open(repoManagerParams);
	} catch (error: any) {
		// If repoPerDocEnabled is true, we want the behavior to be "open or create" for GitRest Write APIs,
		// creating the repository on the fly. So, if the open operation fails with a 400 code (representing
		// the repo does not exist), we try to create the reposiroty instead.
		if (
			repoPerDocEnabled &&
			error instanceof Error &&
			error?.name === "NetworkError" &&
			(error as NetworkError)?.code === 400
		) {
			return repoManagerFactory.create(repoManagerParams);
		}
		throw error;
	}
}

export function getSoftDeletedMarkerPath(basePath: string): string {
	return `${basePath}/.softDeleted`;
}

export async function checkSoftDeleted(
	fileSystemManager: IFileSystemManager,
	repoPath: string,
	repoManagerParams: IRepoManagerParams,
	repoPerDocEnabled: boolean,
): Promise<void> {
	// DELETE API is only implemented for the repo-per-doc model
	if (!repoPerDocEnabled) {
		return;
	}
	const lumberjackProperties = {
		...getLumberjackBasePropertiesFromRepoManagerParams(repoManagerParams),
	};
	const metric = Lumberjack.newLumberMetric(
		GitRestLumberEventName.CheckSoftDeleted,
		lumberjackProperties,
	);
	const softDeletedMarkerPath = getSoftDeletedMarkerPath(repoPath);

	let softDeleted = false;
	try {
		const softDeleteBlobExists = await exists(fileSystemManager, softDeletedMarkerPath);
		softDeleted = softDeleteBlobExists !== false && softDeleteBlobExists.isFile();
		metric.setProperties({ softDeleted });
		metric.success("Checked if document is soft-deleted.");
	} catch (e) {
		metric.error("Failed to check if document is soft-deleted.", e);
		throw e;
	}

	if (softDeleted) {
		const error = new NetworkError(410, "The requested resource has been deleted.");
		Lumberjack.error(
			"Attempted to retrieve soft-deleted document.",
			lumberjackProperties,
			error,
		);
		throw error;
	}
}

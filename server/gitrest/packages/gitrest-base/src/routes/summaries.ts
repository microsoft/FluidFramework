/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	isNetworkError,
	IWholeFlatSummary,
	IWholeSummaryPayload,
	IWriteSummaryResponse,
	NetworkError,
} from "@fluidframework/server-services-client";
import { handleResponse } from "@fluidframework/server-services-shared";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { Router } from "express";
import { Provider } from "nconf";
import {
	BaseGitRestTelemetryProperties,
	checkSoftDeleted,
	Constants,
	getExternalWriterParams,
	getFilesystemManagerFactory,
	getLumberjackBasePropertiesFromRepoManagerParams,
	getRepoManagerFromWriteAPI,
	getRepoManagerParamsFromRequest,
	getSoftDeletedMarkerPath,
	GitWholeSummaryManager,
	IExternalWriterConfig,
	IFileSystemManager,
	IFileSystemManagerFactories,
	IRepoManagerParams,
	IRepositoryManager,
	IRepositoryManagerFactory,
	isContainerSummary,
	latestSummarySha,
	logAndThrowApiError,
	persistLatestFullSummaryInStorage,
	retrieveLatestFullSummaryFromStorage,
	SystemErrors,
} from "../utils";

function getFullSummaryDirectory(repoManager: IRepositoryManager, documentId: string): string {
	return `${repoManager.path}/${documentId}`;
}

async function getSummary(
	repoManager: IRepositoryManager,
	fileSystemManager: IFileSystemManager,
	sha: string,
	repoManagerParams: IRepoManagerParams,
	externalWriterConfig?: IExternalWriterConfig,
	persistLatestFullSummary = false,
	enforceStrictPersistedFullSummaryReads = false,
): Promise<IWholeFlatSummary> {
	const lumberjackProperties = {
		...getLumberjackBasePropertiesFromRepoManagerParams(repoManagerParams),
		[BaseGitRestTelemetryProperties.sha]: sha,
	};

	if (persistLatestFullSummary && sha === latestSummarySha) {
		try {
			const latestFullSummaryFromStorage = await retrieveLatestFullSummaryFromStorage(
				fileSystemManager,
				getFullSummaryDirectory(repoManager, repoManagerParams.storageRoutingId.documentId),
				lumberjackProperties,
			);
			if (latestFullSummaryFromStorage !== undefined) {
				return latestFullSummaryFromStorage;
			}
		} catch (error) {
			// This read is for optimization purposes, so on failure
			// we can try to read the summary in typical fashion.
			Lumberjack.error(
				"Failed to read latest full summary from storage.",
				lumberjackProperties,
				error,
			);
			if (enforceStrictPersistedFullSummaryReads) {
				if (isNetworkError(error) && error.code === 413) {
					throw error;
				}
				if (
					typeof (error as any).code === "string" &&
					(error as any).code === SystemErrors.EFBIG.code
				) {
					throw new NetworkError(413, "Full summary too large.");
				}
			}
		}
	}

	// If we get to this point, it's because one of the options below:
	// 1) we did not want to read the latest full summary from storage
	// 2) we wanted to read the latest full summary, but it did not exist in the storage
	// 3) the summary being requestd is not the latest
	// Therefore, we need to compute the summary from scratch.
	const wholeSummaryManager = new GitWholeSummaryManager(
		repoManagerParams.storageRoutingId.documentId,
		repoManager,
		lumberjackProperties,
		externalWriterConfig?.enabled ?? false,
	);
	const fullSummary = await wholeSummaryManager.readSummary(sha);

	// Now that we computed the summary from scratch, we can persist it to storage if
	// the following conditions are met.
	if (persistLatestFullSummary && sha === latestSummarySha && fullSummary) {
		// We persist the full summary in a fire-and-forget way because we don't want it
		// to impact getSummary latency. So upon computing the full summary above, we should
		// return as soon as possible. Also, we don't care about failures much, since the
		// next getSummary or a createSummary request may trigger persisting to storage.
		persistLatestFullSummaryInStorage(
			fileSystemManager,
			getFullSummaryDirectory(repoManager, repoManagerParams.storageRoutingId.documentId),
			fullSummary,
			lumberjackProperties,
		).catch((error) => {
			Lumberjack.error(
				"Failed to persist latest full summary to storage during getSummary",
				lumberjackProperties,
				error,
			);
		});
	}

	return fullSummary;
}

async function createSummary(
	repoManager: IRepositoryManager,
	fileSystemManager: IFileSystemManager,
	payload: IWholeSummaryPayload,
	repoManagerParams: IRepoManagerParams,
	externalWriterConfig?: IExternalWriterConfig,
	isInitialSummary?: boolean,
	persistLatestFullSummary = false,
	enableLowIoWrite: "initial" | boolean = false,
	optimizeForInitialSummary: boolean = false,
): Promise<IWriteSummaryResponse | IWholeFlatSummary> {
	const lumberjackProperties = {
		...getLumberjackBasePropertiesFromRepoManagerParams(repoManagerParams),
		[BaseGitRestTelemetryProperties.summaryType]: payload?.type,
	};

	const wholeSummaryManager = new GitWholeSummaryManager(
		repoManagerParams.storageRoutingId.documentId,
		repoManager,
		lumberjackProperties,
		externalWriterConfig?.enabled ?? false,
		{
			enableLowIoWrite,
			optimizeForInitialSummary,
		},
	);

	Lumberjack.info("Creating summary", lumberjackProperties);

	const { isNew, writeSummaryResponse } = await wholeSummaryManager.writeSummary(
		payload,
		isInitialSummary,
	);

	// Waiting to pre-compute and persist latest summary would slow down document creation,
	// so skip this step if it is a new document.
	if (isContainerSummary(payload)) {
		const latestFullSummary: IWholeFlatSummary | undefined = (
			writeSummaryResponse as IWholeFlatSummary
		).trees
			? writeSummaryResponse
			: await wholeSummaryManager.readSummary(writeSummaryResponse.id).catch((error) => {
					// This read is for Historian caching purposes, so it should be ignored on failure.
					Lumberjack.error(
						"Failed to read latest summary after writing container summary",
						lumberjackProperties,
						error,
					);
					return undefined;
			  });
		if (latestFullSummary) {
			if (persistLatestFullSummary) {
				// Send latest full summary to storage for faster read access.
				const persistP = persistLatestFullSummaryInStorage(
					fileSystemManager,
					getFullSummaryDirectory(
						repoManager,
						repoManagerParams.storageRoutingId.documentId,
					),
					latestFullSummary,
					lumberjackProperties,
				).catch((error) => {
					// Persisting latest summary is an optimization, not a requirement, so do not throw on failure.
					Lumberjack.error(
						"Failed to persist latest full summary to storage during createSummary",
						lumberjackProperties,
						error,
					);
				});
				if (!isNew) {
					// To avoid any possible race conditions when outside the critical path, we can await the persist operation.
					// Chances for a race condition are slim and likely inconsequential, but better safe than sorry.
					await persistP;
				}
			}
			// Return latest full summary to Historian for caching.
			return latestFullSummary;
		}
	}

	return writeSummaryResponse;
}

async function deleteSummary(
	repoManager: IRepositoryManager,
	fileSystemManager: IFileSystemManager,
	repoManagerParams: IRepoManagerParams,
	softDelete: boolean,
	repoPerDocEnabled: boolean,
	externalWriterConfig?: IExternalWriterConfig,
): Promise<void> {
	if (!repoPerDocEnabled) {
		throw new NetworkError(501, "Not Implemented");
	}
	const lumberjackProperties: Record<string, any> = {
		...getLumberjackBasePropertiesFromRepoManagerParams(repoManagerParams),
		[BaseGitRestTelemetryProperties.repoPerDocEnabled]: repoPerDocEnabled,
		[BaseGitRestTelemetryProperties.softDelete]: softDelete,
	};
	// In repo-per-doc model, the repoManager's path represents the directory that contains summary data.
	const summaryFolderPath = repoManager.path;
	lumberjackProperties.summaryFolderPath = summaryFolderPath;
	Lumberjack.info(`Deleting summary`, lumberjackProperties);

	try {
		if (softDelete) {
			const softDeletedMarkerPath = getSoftDeletedMarkerPath(summaryFolderPath);
			await fileSystemManager.promises.writeFile(softDeletedMarkerPath, "");
			Lumberjack.info(
				`Successfully marked summary data as soft-deleted.`,
				lumberjackProperties,
			);
			return;
		}

		// Hard delete
		await fileSystemManager.promises.rm(summaryFolderPath, { recursive: true });
		Lumberjack.info(`Successfully hard-deleted summary data.`, lumberjackProperties);
	} catch (error: any) {
		if (
			error?.code === "ENOENT" ||
			(error instanceof NetworkError &&
				error?.code === 400 &&
				error?.message.startsWith("Repo does not exist"))
		) {
			// File does not exist.
			Lumberjack.warning(
				"Tried to delete summary, but it does not exist",
				lumberjackProperties,
				error,
			);
			return;
		}
		Lumberjack.error("Failed to delete summary", lumberjackProperties, error);
		throw error;
	}
}

export function create(
	store: Provider,
	fileSystemManagerFactories: IFileSystemManagerFactories,
	repoManagerFactory: IRepositoryManagerFactory,
): Router {
	const router: Router = Router();
	const persistLatestFullSummary: boolean = store.get("git:persistLatestFullSummary") ?? false;
	const enableLowIoWrite: "initial" | boolean = store.get("git:enableLowIoWrite") ?? false;
	const enableOptimizedInitialSummary: boolean =
		store.get("git:enableOptimizedInitialSummary") ?? false;
	const repoPerDocEnabled: boolean = store.get("git:repoPerDocEnabled") ?? false;
	const enforceStrictPersistedFullSummaryReads: boolean =
		store.get("git:enforceStrictPersistedFullSummaryReads") ?? false;

	/**
	 * Retrieves a summary.
	 * If sha is "latest", returns latest summary for owner/repo.
	 */
	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	router.get("/repos/:owner/:repo/git/summaries/:sha", async (request, response) => {
		const repoManagerParams = getRepoManagerParamsFromRequest(request);
		if (
			!repoManagerParams.storageRoutingId?.tenantId ||
			!repoManagerParams.storageRoutingId?.documentId
		) {
			handleResponse(
				Promise.reject(
					new NetworkError(400, `Invalid ${Constants.StorageRoutingIdHeader} header`),
				),
				response,
			);
			return;
		}
		const resultP = repoManagerFactory
			.open(repoManagerParams)
			.then(async (repoManager) => {
				const fileSystemManagerFactory = getFilesystemManagerFactory(
					fileSystemManagerFactories,
					repoManagerParams.isEphemeralContainer,
				);
				const fsManager = fileSystemManagerFactory.create(
					repoManagerParams.fileSystemManagerParams,
				);
				await checkSoftDeleted(
					fsManager,
					repoManager.path,
					repoManagerParams,
					repoPerDocEnabled,
				);
				return getSummary(
					repoManager,
					fsManager,
					request.params.sha,
					repoManagerParams,
					getExternalWriterParams(request.query?.config as string | undefined),
					persistLatestFullSummary,
					enforceStrictPersistedFullSummaryReads,
				);
			})
			.catch((error) => logAndThrowApiError(error, request, repoManagerParams));
		handleResponse(resultP, response);
	});

	/**
	 * Creates a new summary.
	 */
	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	router.post("/repos/:owner/:repo/git/summaries", async (request, response) => {
		const repoManagerParams = getRepoManagerParamsFromRequest(request);
		// request.query type is { [string]: string } but it's actually { [string]: any }
		// Account for possibilities of undefined, boolean, or string types. A number will be false.
		const isInitialSummary: boolean | undefined =
			typeof request.query.initial === "undefined"
				? undefined
				: typeof request.query.initial === "boolean"
				? request.query.initial
				: request.query.initial === "true";

		const lumberjackProperties = {
			...getLumberjackBasePropertiesFromRepoManagerParams(repoManagerParams),
			[BaseGitRestTelemetryProperties.repoPerDocEnabled]: repoPerDocEnabled,
			[BaseGitRestTelemetryProperties.isInitial]: isInitialSummary,
		};
		Lumberjack.info("Received request to create a summary", lumberjackProperties);

		if (
			!repoManagerParams.storageRoutingId?.tenantId ||
			!repoManagerParams.storageRoutingId?.documentId
		) {
			handleResponse(
				Promise.reject(
					new NetworkError(400, `Invalid ${Constants.StorageRoutingIdHeader} header`),
				),
				response,
			);
			return;
		}
		const wholeSummaryPayload: IWholeSummaryPayload = request.body;
		const resultP = (async () => {
			// There are possible optimizations we can make throughout the summary write process
			// if we are using repoPerDoc model and it is the first summary for that document.
			const optimizeForInitialSummary =
				enableOptimizedInitialSummary && isInitialSummary && repoPerDocEnabled;
			// If creating a repo per document, we do not need to check for an existing repo on initial summary write.
			const repoManager = await getRepoManagerFromWriteAPI(
				repoManagerFactory,
				repoManagerParams,
				repoPerDocEnabled,
				optimizeForInitialSummary,
			);
			const fileSystemManagerFactory = getFilesystemManagerFactory(
				fileSystemManagerFactories,
				repoManagerParams.isEphemeralContainer,
			);
			const fsManager = fileSystemManagerFactory.create(
				repoManagerParams.fileSystemManagerParams,
			);
			// A new document cannot already be soft-deleted.
			if (!optimizeForInitialSummary) {
				await checkSoftDeleted(
					fsManager,
					repoManager.path,
					repoManagerParams,
					repoPerDocEnabled,
				);
			}
			return createSummary(
				repoManager,
				fsManager,
				wholeSummaryPayload,
				repoManagerParams,
				getExternalWriterParams(request.query?.config as string | undefined),
				isInitialSummary,
				persistLatestFullSummary,
				enableLowIoWrite,
				optimizeForInitialSummary,
			);
		})().catch((error) => logAndThrowApiError(error, request, repoManagerParams));
		handleResponse(resultP, response, undefined, undefined, 201);
	});

	/**
	 * Deletes the latest summary for the given document.
	 * If header Soft-Delete="true", only flags summary as deleted.
	 */
	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	router.delete("/repos/:owner/:repo/git/summaries", async (request, response) => {
		const repoManagerParams = getRepoManagerParamsFromRequest(request);
		if (
			!repoManagerParams.storageRoutingId?.tenantId ||
			!repoManagerParams.storageRoutingId?.documentId
		) {
			handleResponse(
				Promise.reject(
					new NetworkError(400, `Invalid ${Constants.StorageRoutingIdHeader} header`),
				),
				response,
			);
			return;
		}
		const softDelete = request.get("Soft-Delete")?.toLowerCase() === "true";
		const resultP = repoManagerFactory
			.open(repoManagerParams)
			.then(async (repoManager) => {
				const fileSystemManagerFactory = getFilesystemManagerFactory(
					fileSystemManagerFactories,
					repoManagerParams.isEphemeralContainer,
				);
				const fsManager = fileSystemManagerFactory.create(
					repoManagerParams.fileSystemManagerParams,
				);
				return deleteSummary(
					repoManager,
					fsManager,
					repoManagerParams,
					softDelete,
					repoPerDocEnabled,
					getExternalWriterParams(request.query?.config as string | undefined),
				);
			})
			.catch((error) => {
				if (isNetworkError(error)) {
					if (error.code === 400 && error.message.startsWith("Repo does not exist")) {
						// Document is already deleted, so there is nothing to do. This is a deletion success.
						const lumberjackProperties = {
							...getLumberjackBasePropertiesFromRepoManagerParams(repoManagerParams),
							[BaseGitRestTelemetryProperties.repoPerDocEnabled]: repoPerDocEnabled,
							[BaseGitRestTelemetryProperties.softDelete]: softDelete,
						};
						Lumberjack.info(
							"Attempted to delete document that was already deleted or did not exist",
							lumberjackProperties,
						);
						return;
					}
				}

				logAndThrowApiError(error, request, repoManagerParams);
			});
		handleResponse(resultP, response, undefined, undefined, 204);
	});

	return router;
}

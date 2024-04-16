/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRef } from "@fluidframework/gitresources";
import {
	ICreateRefParamsExternal,
	IPatchRefParamsExternal,
	NetworkError,
} from "@fluidframework/server-services-client";
import { handleResponse } from "@fluidframework/server-services-shared";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { Router } from "express";
import nconf from "nconf";
import {
	checkSoftDeleted,
	getExternalWriterParams,
	getFilesystemManagerFactory,
	getGitManagerFactoryParamsFromConfig,
	getLatestFullSummaryDirectory,
	getLumberjackBasePropertiesFromRepoManagerParams,
	getRepoInfoFromParamsAndStorageConfig,
	getRepoManagerFromWriteAPI,
	getRepoManagerParamsFromRequest,
	IFileSystemManagerFactories,
	IRepositoryManagerFactory,
	isRepoNotExistsError,
	logAndThrowApiError,
	retrieveLatestFullSummaryFromStorage,
	WholeSummaryConstants,
} from "../../utils";

/**
 * Simple method to convert from a path id to the git reference ID
 */
function getRefId(id): string {
	return `refs/${id}`;
}

export function create(
	store: nconf.Provider,
	fileSystemManagerFactories: IFileSystemManagerFactories,
	repoManagerFactory: IRepositoryManagerFactory,
): Router {
	const router: Router = Router();
	const { storageDirectoryConfig, repoPerDocEnabled } =
		getGitManagerFactoryParamsFromConfig(store);
	const lazyRepoInitEnabled: boolean = store.get("git:lazyRepoInitEnabled") ?? false;

	// https://developer.github.com/v3/git/refs/

	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	router.get("/repos/:owner/:repo/git/refs", async (request, response, next) => {
		const repoManagerParams = getRepoManagerParamsFromRequest(request);
		const resultP = repoManagerFactory
			.open(repoManagerParams)
			.then(async (repoManager) => {
				const fileSystemManagerFactory = getFilesystemManagerFactory(
					fileSystemManagerFactories,
					repoManagerParams.isEphemeralContainer,
				);
				const fsManager = fileSystemManagerFactory.create({
					...repoManagerParams.fileSystemManagerParams,
					rootDir: repoManager.path,
				});
				await checkSoftDeleted(
					fsManager,
					repoManager.path,
					repoManagerParams,
					repoPerDocEnabled,
				);
				return repoManager.getRefs();
			})
			.catch((error) => logAndThrowApiError(error, request, repoManagerParams));
		handleResponse(resultP, response);
	});

	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	router.get("/repos/:owner/:repo/git/refs/*", async (request, response, next) => {
		const repoManagerParams = getRepoManagerParamsFromRequest(request);
		const resultP = repoManagerFactory
			.open(repoManagerParams)
			.then(async (repoManager) => {
				const fileSystemManagerFactory = getFilesystemManagerFactory(
					fileSystemManagerFactories,
					repoManagerParams.isEphemeralContainer,
				);
				const fsManager = fileSystemManagerFactory.create({
					...repoManagerParams.fileSystemManagerParams,
					rootDir: repoManager.path,
				});
				await checkSoftDeleted(
					fsManager,
					repoManager.path,
					repoManagerParams,
					repoPerDocEnabled,
				);
				return repoManager.getRef(
					getRefId(request.params[0]),
					getExternalWriterParams(request.query?.config as string),
				);
			})
			.catch(async (error) => {
				if (lazyRepoInitEnabled && isRepoNotExistsError(error)) {
					const fileSystemManagerFactory = getFilesystemManagerFactory(
						fileSystemManagerFactories,
						repoManagerParams.isEphemeralContainer,
					);
					const { directoryPath } = getRepoInfoFromParamsAndStorageConfig(
						repoPerDocEnabled,
						repoManagerParams,
						storageDirectoryConfig,
					);
					const fileSystemManager = fileSystemManagerFactory.create({
						...repoManagerParams.fileSystemManagerParams,
						rootDir: directoryPath,
					});
					const latestFullSummaryDirectory = getLatestFullSummaryDirectory(
						directoryPath,
						repoManagerParams.storageRoutingId?.documentId ??
							repoManagerParams.repoName,
					);
					const lumberjackProperties = {
						...getLumberjackBasePropertiesFromRepoManagerParams(repoManagerParams),
					};
					try {
						const latestFullSummaryFromStorage =
							await retrieveLatestFullSummaryFromStorage(
								fileSystemManager,
								latestFullSummaryDirectory,
								lumberjackProperties,
							);
						if (!latestFullSummaryFromStorage) {
							throw new NetworkError(404, "No latest full summary found");
						}
						const dummyRef: IRef = {
							ref: getRefId(request.params[0]),
							url: `/repos/${repoManagerParams.repoOwner}/${
								repoManagerParams.repoName
							}/git/refs/${getRefId(request.params[0])}`,
							object: {
								sha: WholeSummaryConstants.LatestSummarySha,
								type: "commit",
								url: `/repos/${repoManagerParams.repoOwner}/${repoManagerParams.repoName}/git/commits/${WholeSummaryConstants.LatestSummarySha}`,
							},
						};
						return dummyRef;
					} catch (lazyRepoRecoveryError: unknown) {
						Lumberjack.error(
							"Failed to spoof ref for lazy repo",
							lumberjackProperties,
							lazyRepoRecoveryError,
						);
					}
				}
				logAndThrowApiError(error, request, repoManagerParams);
			});
		handleResponse(resultP, response);
	});

	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	router.post("/repos/:owner/:repo/git/refs", async (request, response, next) => {
		const repoManagerParams = getRepoManagerParamsFromRequest(request);
		const createRefParams = request.body as ICreateRefParamsExternal;
		const resultP = getRepoManagerFromWriteAPI(
			repoManagerFactory,
			repoManagerParams,
			repoPerDocEnabled,
		)
			.then(async ({ repoManager }) => {
				const fileSystemManagerFactory = getFilesystemManagerFactory(
					fileSystemManagerFactories,
					repoManagerParams.isEphemeralContainer,
				);
				const fsManager = fileSystemManagerFactory.create({
					...repoManagerParams.fileSystemManagerParams,
					rootDir: repoManager.path,
				});
				await checkSoftDeleted(
					fsManager,
					repoManager.path,
					repoManagerParams,
					repoPerDocEnabled,
				);
				return repoManager.createRef(createRefParams, createRefParams.config);
			})
			.catch((error) => logAndThrowApiError(error, request, repoManagerParams));
		handleResponse(resultP, response, undefined, undefined, 201);
	});

	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	router.patch("/repos/:owner/:repo/git/refs/*", async (request, response, next) => {
		const repoManagerParams = getRepoManagerParamsFromRequest(request);
		const patchRefParams = request.body as IPatchRefParamsExternal;
		const resultP = getRepoManagerFromWriteAPI(
			repoManagerFactory,
			repoManagerParams,
			repoPerDocEnabled,
		)
			.then(async ({ repoManager }) => {
				const fileSystemManagerFactory = getFilesystemManagerFactory(
					fileSystemManagerFactories,
					repoManagerParams.isEphemeralContainer,
				);
				const fsManager = fileSystemManagerFactory.create({
					...repoManagerParams.fileSystemManagerParams,
					rootDir: repoManager.path,
				});
				await checkSoftDeleted(
					fsManager,
					repoManager.path,
					repoManagerParams,
					repoPerDocEnabled,
				);
				return repoManager.patchRef(
					getRefId(request.params[0]),
					patchRefParams,
					patchRefParams.config,
				);
			})
			.catch((error) => logAndThrowApiError(error, request, repoManagerParams));
		handleResponse(resultP, response);
	});

	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	router.delete("/repos/:owner/:repo/git/refs/*", async (request, response, next) => {
		const repoManagerParams = getRepoManagerParamsFromRequest(request);
		const resultP = repoManagerFactory
			.open(repoManagerParams)
			.then(async (repoManager) => {
				const fileSystemManagerFactory = getFilesystemManagerFactory(
					fileSystemManagerFactories,
					repoManagerParams.isEphemeralContainer,
				);
				const fsManager = fileSystemManagerFactory.create({
					...repoManagerParams.fileSystemManagerParams,
					rootDir: repoManager.path,
				});
				await checkSoftDeleted(
					fsManager,
					repoManager.path,
					repoManagerParams,
					repoPerDocEnabled,
				);
				return repoManager.deleteRef(getRefId(request.params[0]));
			})
			.catch((error) => logAndThrowApiError(error, request, repoManagerParams));
		handleResponse(resultP, response, undefined, undefined, 204);
	});
	return router;
}

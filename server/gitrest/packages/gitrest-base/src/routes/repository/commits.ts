/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { handleResponse } from "@fluidframework/server-services-shared";
import { Router } from "express";
import nconf from "nconf";
import type { ICommitDetails } from "@fluidframework/gitresources";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { NetworkError } from "@fluidframework/server-services-client";
import {
	checkSoftDeleted,
	getExternalWriterParams,
	getFilesystemManagerFactory,
	getGitManagerFactoryParamsFromConfig,
	getLatestFullSummaryDirectory,
	getLumberjackBasePropertiesFromRepoManagerParams,
	getRepoInfoFromParamsAndStorageConfig,
	getRepoManagerParamsFromRequest,
	IFileSystemManagerFactories,
	IRepositoryManagerFactory,
	isRepoNotExistsError,
	logAndThrowApiError,
	retrieveLatestFullSummaryFromStorage,
	WholeSummaryConstants,
} from "../../utils";

export function create(
	store: nconf.Provider,
	fileSystemManagerFactories: IFileSystemManagerFactories,
	repoManagerFactory: IRepositoryManagerFactory,
): Router {
	const router: Router = Router();
	const { storageDirectoryConfig, repoPerDocEnabled } =
		getGitManagerFactoryParamsFromConfig(store);
	const lazyRepoInitCompatEnabled: boolean = store.get("git:enableLazyRepoInitCompat") ?? false;

	// https://developer.github.com/v3/repos/commits/
	// sha
	// path
	// author
	// since
	// until

	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	router.get("/repos/:owner/:repo/commits", async (request, response, next) => {
		// TODO: Broken for lazy repo because repo does not exist
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
				return repoManager.getCommits(
					request.query.sha as string,
					Number(request.query.count as string),
					getExternalWriterParams(request.query?.config as string),
				);
			})
			.catch(async (error) => {
				if (lazyRepoInitCompatEnabled && isRepoNotExistsError(error)) {
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
						const dummyCommitDetails: ICommitDetails = {
							sha: WholeSummaryConstants.InitialSummarySha,
							commit: {
								author: {
									date: new Date().toISOString(),
									email: "dummy@microsoft.com",
									name: "GitRest Service",
								},
								committer: {
									date: new Date().toISOString(),
									email: "dummy@microsoft.com",
									name: "GitRest Service",
								},
								tree: {
									sha: latestFullSummaryFromStorage.trees[0]?.id,
									url: `/repos/${repoManagerParams.repoOwner}/${repoManagerParams.repoName}/git/trees/${WholeSummaryConstants.InitialSummarySha}`,
								},
								message: "Dummy commit for lazy repo initial summary",
								url: `/repos/${repoManagerParams.repoOwner}/${repoManagerParams.repoName}/git/commits/${WholeSummaryConstants.InitialSummarySha}`,
							},
							parents: [],
							url: `/repos/${repoManagerParams.repoOwner}/${repoManagerParams.repoName}/git/commits/${WholeSummaryConstants.InitialSummarySha}`,
						};
						return [dummyCommitDetails];
					} catch (lazyRepoRecoveryError: unknown) {
						Lumberjack.warning(
							"Failed to spoof commits for possible lazy repo",
							lumberjackProperties,
							lazyRepoRecoveryError,
						);
					}
				}
				logAndThrowApiError(error, request, repoManagerParams);
			});
		handleResponse(resultP, response);
	});

	return router;
}

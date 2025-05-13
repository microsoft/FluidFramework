/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { handleResponse } from "@fluidframework/server-services-shared";
import { Router } from "express";
import nconf from "nconf";
import {
	checkSoftDeleted,
	getExternalWriterParams,
	getFilesystemManagerFactory,
	getRepoManagerParamsFromRequest,
	IFileSystemManagerFactories,
	IRepositoryManagerFactory,
	logAndThrowApiError,
} from "../../utils";

export function create(
	store: nconf.Provider,
	fileSystemManagerFactories: IFileSystemManagerFactories,
	repoManagerFactory: IRepositoryManagerFactory,
): Router {
	const router: Router = Router();
	const repoPerDocEnabled: boolean = store.get("git:repoPerDocEnabled") ?? false;

	// https://developer.github.com/v3/repos/commits/
	// sha
	// path
	// author
	// since
	// until

	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	router.get("/repos/:owner/:repo/commits", async (request, response, next) => {
		const repoManagerParams = getRepoManagerParamsFromRequest(request);
		const resultP = repoManagerFactory
			.open(repoManagerParams)
			.then(async (repoManager) => {
				const fileSystemManagerFactory = getFilesystemManagerFactory(
					fileSystemManagerFactories,
					repoManagerParams.isEphemeralContainer ?? false,
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
			.catch((error) => logAndThrowApiError(error, request, repoManagerParams));
		handleResponse(resultP, response);
	});

	return router;
}

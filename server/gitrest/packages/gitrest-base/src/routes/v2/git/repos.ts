/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateRepoParams } from "@fluidframework/gitresources";
import { handleResponse } from "@fluidframework/server-services-shared";
import { Router } from "express";
import nconf from "nconf";
import {
	getRepoManagerParamsFromRequest,
	IRepositoryManagerFactory,
	logAndThrowApiError,
} from "../../../utils";

export function create(
	store: nconf.Provider,
	repoManagerFactory: IRepositoryManagerFactory,
): Router {
	const router: Router = Router();
	const repoPerDocEnabled: boolean = store.get("git:repoPerDocEnabled") ?? false;

	/**
	 * Creates a new git repository
	 */
	router.post("/:owner/repos", (request, response, next) => {
		if (repoPerDocEnabled) {
			// GitRest now supports an alternative setup called "repo-per-doc model". In that setup,
			// the idea is that we map Git repositories to Fluid documents - previously, we would map
			// each repo to a tenantId, and each document would be a branch in that repo. "repo-per-doc"
			// provides interesting advantages in terms of Git performance, Garbage Collection, etc.
			// Traditionally, getOrCreateRepository() from services-utils would be used to create Git repos.
			// Now, repos would be created "just in time" by GitRest Write APIs. To avoid making "repo-per-doc"
			// a breaking change and to reduce changing components as much as possible, we scoped the change down
			// to GitRest. In other words, getOrCreateRepository() will temporarily keep calling these "repo" APIs.
			// But they will be no-op when `repoPerDocEnabled` is true. So in that case, we just reply with a
			// dummy 201 response.
			// TODO: remove this repos.ts file once Routerlicious can function without getOrCreateRepository().
			return response.status(201).send();
		}

		const createParams = request.body as ICreateRepoParams;
		if (!createParams?.name) {
			return response.status(400).json("Invalid repo name");
		}

		const repoManagerParams = getRepoManagerParamsFromRequest(request);
		const repoManagerP = repoManagerFactory
			.create({ ...repoManagerParams, repoName: createParams.name })
			.then(() => undefined)
			.catch((error) => logAndThrowApiError(error, request, repoManagerParams));

		handleResponse(repoManagerP, response, undefined, undefined, 201);
	});

	/**
	 * Retrieves an existing get repository
	 */
	router.get("/repos/:owner/:repo", (request, response, next) => {
		const result = { name: request.params.repo };

		if (repoPerDocEnabled) {
			// GitRest now supports an alternative setup called "repo-per-doc model". In that setup,
			// the idea is that we map Git repositories to Fluid documents - previously, we would map
			// each repo to a tenantId, and each document would be a branch in that repo. "repo-per-doc"
			// provides interesting advantages in terms of Git performance, Garbage Collection, etc.
			// Traditionally, getOrCreateRepository() from services-utils would be used to create Git repos.
			// Now, repos would be created "just in time" by GitRest Write APIs. To avoid making "repo-per-doc"
			// a breaking change and to reduce changing components as much as possible, we scoped the change down
			// to GitRest. In other words, getOrCreateRepository() will temporarily keep calling these "repo" APIs.
			// But they will be no-op when `repoPerDocEnabled` is true. So in that case, we just reply with a
			// dummy 200 response. Please note that the body of the response is semantically inaccurate, though:
			// In the "repo-per-doc" model, the repo name would be `tenantId/documentId`. Here, we are using the
			// body from the request sent by getOrCreateRepository(), which maps to `tenantId` only.
			// getOrCreateRepository() does not have any knowledge about documentId, which means this route
			// does not either. Since this is just a workaround until GitRest fully uses "repo-per-doc",
			// it's ok for the repo name in the dummy response to be inaccurate - it's actually never read by
			// getOrCreateRepository().
			// TODO: remove this repos.ts file once Routerlicious can function without getOrCreateRepository().
			return response.status(200).json(result);
		}

		const repoManagerParams = getRepoManagerParamsFromRequest(request);
		const repoManagerP = repoManagerFactory
			.open(repoManagerParams)
			.then(() => result)
			.catch((error) => logAndThrowApiError(error, request, repoManagerParams));

		handleResponse(repoManagerP, response);
	});

	return router;
}

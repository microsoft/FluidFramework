/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@fluidframework/gitresources";
import {
	IStorageNameRetriever,
	IThrottler,
	IRevokedTokenChecker,
	IDocumentManager,
	type IDenyList,
} from "@fluidframework/server-services-core";
import {
	denyListMiddleware,
	IThrottleMiddlewareOptions,
	throttle,
} from "@fluidframework/server-services-utils";
import { validateRequestParams } from "@fluidframework/server-services-shared";
import { Router } from "express";
import * as nconf from "nconf";
import winston from "winston";
import { ICache, ITenantService, ISimplifiedCustomDataRetriever } from "../../services";
import * as utils from "../utils";
import { Constants } from "../../utils";
import { ScopeType } from "@fluidframework/protocol-definitions";

export function create(
	config: nconf.Provider,
	tenantService: ITenantService,
	storageNameRetriever: IStorageNameRetriever | undefined,
	restTenantThrottlers: Map<string, IThrottler>,
	restClusterThrottlers: Map<string, IThrottler>,
	documentManager: IDocumentManager,
	cache?: ICache,
	revokedTokenChecker?: IRevokedTokenChecker,
	denyList?: IDenyList,
	ephemeralDocumentTTLSec?: number,
	simplifiedCustomDataRetriever?: ISimplifiedCustomDataRetriever,
): Router {
	const router: Router = Router();

	const maxTokenLifetimeSec = config.get("maxTokenLifetimeSec");

	const tenantThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: (req) => req.params.tenantId,
		throttleIdSuffix: Constants.historianRestThrottleIdSuffix,
	};
	const restTenantGeneralThrottler = restTenantThrottlers.get(
		Constants.generalRestCallThrottleIdPrefix,
	);

	async function createBlob(
		tenantId: string,
		authorization: string | undefined,
		body: git.ICreateBlobParams,
	): Promise<git.ICreateBlobResponse> {
		const service = await utils.createGitService({
			config,
			tenantId,
			authorization,
			tenantService,
			storageNameRetriever,
			documentManager,
			cache,
			ephemeralDocumentTTLSec,
			simplifiedCustomDataRetriever,
		});
		return service.createBlob(body);
	}

	async function getBlob(
		tenantId: string,
		authorization: string | undefined,
		sha: string,
		useCache: boolean,
	): Promise<git.IBlob> {
		const service = await utils.createGitService({
			config,
			tenantId,
			authorization,
			tenantService,
			storageNameRetriever,
			documentManager,
			cache,
			ephemeralDocumentTTLSec,
		});
		return service.getBlob(sha, useCache);
	}

	/**
	 * Historian https ping endpoint for availability monitoring system
	 */
	router.get(
		"/repos/ping",
		throttle(restTenantGeneralThrottler, winston, {
			...tenantThrottleOptions,
			throttleIdPrefix: "ping",
		}),
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		async (request, response) => {
			response.sendStatus(200);
		},
	);

	router.post(
		"/repos/:ignored?/:tenantId/git/blobs",
		validateRequestParams("tenantId"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(
			revokedTokenChecker,
			[ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
			maxTokenLifetimeSec,
		),
		denyListMiddleware(denyList),
		(request, response, next) => {
			const blobP = createBlob(
				request.params.tenantId,
				request.get("Authorization"),
				request.body,
			);
			utils.handleResponse(blobP, response, false, 201);
		},
	);

	/**
	 * Retrieves the given blob from the repository
	 */
	router.get(
		"/repos/:ignored?/:tenantId/git/blobs/:sha",
		validateRequestParams("tenantId", "sha"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(revokedTokenChecker, [ScopeType.DocRead], maxTokenLifetimeSec),
		denyListMiddleware(denyList),
		(request, response, next) => {
			const useCache = !("disableCache" in request.query);
			const blobP = getBlob(
				request.params.tenantId,
				request.get("Authorization"),
				request.params.sha,
				useCache,
			);
			utils.handleResponse(blobP, response, useCache);
		},
	);

	/**
	 * Retrieves the given blob as an image
	 */
	router.get(
		"/repos/:ignored?/:tenantId/git/blobs/raw/:sha",
		validateRequestParams("tenantId", "sha"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(revokedTokenChecker, [ScopeType.DocRead], maxTokenLifetimeSec),
		denyListMiddleware(denyList),
		(request, response, next) => {
			const useCache = !("disableCache" in request.query);

			const blobP = getBlob(
				request.params.tenantId,
				request.get("Authorization"),
				request.params.sha,
				useCache,
			);

			blobP
				.then((blob) => {
					if (useCache) {
						response.setHeader("Cache-Control", "public, max-age=31536000");
					}
					// Make sure the browser will expose specific headers for performance analysis.
					response.setHeader(
						"Access-Control-Expose-Headers",
						"Content-Encoding, Content-Length, Content-Type",
					);
					// In order to report W3C timings, Time-Allow-Origin needs to be set.
					response.setHeader("Timing-Allow-Origin", "*");
					response
						.status(200)
						.write(Buffer.from(blob.content, "base64"), () => response.end());
				})
				.catch((error) => {
					response.status(error?.code ?? 400).json(error?.message ?? error);
				});
		},
	);

	return router;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { RequestHandler } from "express";
import { decode } from "jsonwebtoken";
import * as nconf from "nconf";
import { ITokenClaims } from "@fluidframework/protocol-definitions";
import { NetworkError } from "@fluidframework/server-services-client";
import { validateTokenClaims } from "@fluidframework/server-services-utils";
import { handleResponse } from "@fluidframework/server-services-shared";
import {
	Lumberjack,
	getGlobalTelemetryContext,
	getLumberBaseProperties,
} from "@fluidframework/server-services-telemetry";
import {
	runWithRetry,
	IStorageNameRetriever,
	IRevokedTokenChecker,
	IDocumentManager,
	IDocumentStaticProperties,
} from "@fluidframework/server-services-core";
import {
	ICache,
	ITenantService,
	RestGitService,
	ITenantCustomDataExternal,
	IDenyList,
} from "../services";
import { containsPathTraversal, parseToken } from "../utils";

export { handleResponse } from "@fluidframework/server-services-shared";

export class createGitServiceArgs {
	config: nconf.Provider;
	tenantId: string;
	authorization: string;
	tenantService: ITenantService;
	storageNameRetriever: IStorageNameRetriever;
	documentManager: IDocumentManager;
	cache?: ICache;
	asyncLocalStorage?: AsyncLocalStorage<string>;
	initialUpload?: boolean = false;
	storageName?: string;
	allowDisabledTenant?: boolean = false;
	isEphemeralContainer?: boolean = false;
	denyList?: IDenyList;
}

export async function createGitService(createArgs: createGitServiceArgs): Promise<RestGitService> {
	const {
		config,
		tenantId,
		authorization,
		tenantService,
		storageNameRetriever,
		documentManager,
		cache,
		asyncLocalStorage,
		initialUpload,
		storageName,
		allowDisabledTenant,
		isEphemeralContainer,
		denyList,
	} = createArgs;
	const token = parseToken(tenantId, authorization);
	const decoded = decode(token) as ITokenClaims;
	const documentId = decoded.documentId;
	if (containsPathTraversal(documentId)) {
		// Prevent attempted directory traversal.
		throw new NetworkError(400, `Invalid document id: ${documentId}`);
	}
	if (denyList?.isDenied(tenantId, documentId)) {
		throw new NetworkError(500, `Unable to process request for document id: ${documentId}`);
	}
	const details = await tenantService.getTenant(tenantId, token, allowDisabledTenant);
	const customData: ITenantCustomDataExternal = details.customData;
	const writeToExternalStorage = !!customData?.externalStorageData;
	const storageUrl = config.get("storageUrl") as string | undefined;
	const ignoreEphemeralFlag: boolean = config.get("ignoreEphemeralFlag");
	const maxCacheableSummarySize: number =
		config.get("restGitService:maxCacheableSummarySize") ?? 1_000_000_000; // default: 1gb

	let isEphemeral: boolean = false;
	if (!ignoreEphemeralFlag) {
		const isEphemeralKey: string = `isEphemeralContainer:${documentId}`;
		if (typeof isEphemeralContainer === "boolean") {
			// If an isEphemeral flag was passed in, cache it
			Lumberjack.info(
				`Setting cache for ${isEphemeralKey} to ${isEphemeralContainer}.`,
				getLumberBaseProperties(documentId, tenantId),
			);
			isEphemeral = isEphemeralContainer;
			runWithRetry(
				async () => cache?.set(isEphemeralKey, isEphemeral) /* api */,
				"utils.createGitService.set" /* callName */,
				3 /* maxRetries */,
				1000 /* retryAfterMs */,
				getLumberBaseProperties(documentId, tenantId) /* telemetryProperties */,
			).catch((error) => {
				Lumberjack.error(
					`Error setting ${isEphemeralKey} in redis`,
					getLumberBaseProperties(documentId, tenantId),
					error,
				);
			});
		} else {
			runWithRetry<boolean>(
				async () => cache?.get(isEphemeralKey) /* api */,
				"utils.createGitService.get" /* callName */,
				3 /* maxRetries */,
				1000 /* retryAfterMs */,
				getLumberBaseProperties(documentId, tenantId) /* telemetryProperties */,
			)
				.then((value) => {
					isEphemeral = value;
				})
				.catch((error) => {
					Lumberjack.error(
						`Error getting ${isEphemeralKey} from redis`,
						getLumberBaseProperties(documentId, tenantId),
						error,
					);
				});
			if (typeof isEphemeral !== "boolean") {
				// If isEphemeral was not in the cache, fetch the value from database
				try {
					const staticProps: IDocumentStaticProperties =
						await documentManager.readStaticProperties(tenantId, documentId);
					isEphemeral = staticProps?.isEphemeralContainer ?? false;
					await cache?.set(isEphemeralKey, isEphemeral); // Cache the value from the static data
				} catch (e) {
					Lumberjack.verbose(
						`Failed to retrieve static data from document when checking isEphemeral flag.`,
						getLumberBaseProperties(documentId, tenantId),
					);
					isEphemeral = false;
				}
			}
		}
	}
	if (isEphemeral) {
		Lumberjack.info(`Document is ephemeral.`, getLumberBaseProperties(documentId, tenantId));
	}

	const calculatedStorageName =
		initialUpload && storageName
			? storageName
			: (await storageNameRetriever?.get(tenantId, documentId)) ?? customData?.storageName;
	const service = new RestGitService(
		details.storage,
		writeToExternalStorage,
		tenantId,
		documentId,
		cache,
		asyncLocalStorage,
		calculatedStorageName,
		storageUrl,
		isEphemeral,
		maxCacheableSummarySize,
	);
	return service;
}

/**
 * Helper function to convert Request's query param to a number.
 * @param value - The value to be converted to number.
 */
export function queryParamToNumber(value: any): number {
	if (typeof value !== "string") {
		return undefined;
	}
	const parsedValue = parseInt(value, 10);
	return isNaN(parsedValue) ? undefined : parsedValue;
}

/**
 * Helper function to convert Request's query param to a string.
 * @param value - The value to be converted to number.
 */
export function queryParamToString(value: any): string {
	if (typeof value !== "string") {
		return undefined;
	}
	return value;
}

export function verifyToken(revokedTokenChecker: IRevokedTokenChecker | undefined): RequestHandler {
	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	return async (request, response, next) => {
		try {
			const reqTenantId = request.params.tenantId;
			const authorization = request.get("Authorization");
			const token = parseToken(reqTenantId, authorization);
			const claims = validateTokenClaims(token, "documentId", reqTenantId, false);
			const documentId = claims.documentId;
			const tenantId = claims.tenantId;
			if (containsPathTraversal(documentId)) {
				// Prevent attempted directory traversal.
				throw new NetworkError(400, `Invalid document id: ${documentId}`);
			}
			// Verify token not revoked if JTI claim is present
			if (revokedTokenChecker && claims.jti) {
				const isTokenRevoked = await revokedTokenChecker.isTokenRevoked(
					tenantId,
					claims.documentId,
					claims.jti,
				);

				if (isTokenRevoked) {
					throw new NetworkError(
						403,
						"Permission denied. Token has been revoked.",
						false /* canRetry */,
						true /* isFatal */,
					);
				}
			}
			// eslint-disable-next-line @typescript-eslint/return-await
			return getGlobalTelemetryContext().bindPropertiesAsync(
				{ tenantId, documentId },
				async () => next(),
			);
		} catch (error) {
			return handleResponse(Promise.reject(error), response);
		}
	};
}

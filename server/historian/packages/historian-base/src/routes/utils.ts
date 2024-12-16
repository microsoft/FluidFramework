/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
	ISimplifiedCustomDataRetriever,
	IRevokedTokenChecker,
	IDocumentManager,
	IThrottler,
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

export type CommonRouteParams = [
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
];

export interface ICreateGitServiceArgs {
	config: nconf.Provider;
	tenantId: string;
	authorization: string | undefined;
	tenantService: ITenantService;
	storageNameRetriever?: IStorageNameRetriever;
	documentManager: IDocumentManager;
	cache?: ICache;
	initialUpload?: boolean;
	storageName?: string;
	allowDisabledTenant?: boolean;
	isEphemeralContainer?: boolean;
	ephemeralDocumentTTLSec?: number; // 24 hours
	denyList?: IDenyList;
	simplifiedCustomDataRetriever?: ISimplifiedCustomDataRetriever;
}

const defaultCreateGitServiceArgs: Required<
	Pick<
		ICreateGitServiceArgs,
		"initialUpload" | "allowDisabledTenant" | "isEphemeralContainer" | "ephemeralDocumentTTLSec"
	>
> = {
	initialUpload: false,
	allowDisabledTenant: false,
	isEphemeralContainer: false,
	ephemeralDocumentTTLSec: 60 * 60 * 24, // 24 hours
};

function getEphemeralContainerCacheKey(documentId: string): string {
	return `isEphemeralContainer:${documentId}`;
}

async function updateIsEphemeralCache(
	documentId: string,
	tenantId: string,
	isEphemeral: boolean,
	cache: ICache | undefined,
): Promise<void> {
	if (!cache) {
		Lumberjack.warning("Cache not provided. Skipping ephemeral cache update.", {
			...getLumberBaseProperties(documentId, tenantId),
			isEphemeral,
		});
		return;
	}
	const isEphemeralKey: string = getEphemeralContainerCacheKey(documentId);
	Lumberjack.info(
		`Setting cache for ${isEphemeralKey} to ${isEphemeral}.`,
		getLumberBaseProperties(documentId, tenantId),
	);
	await runWithRetry(
		async () => cache?.set(isEphemeralKey, isEphemeral) /* api */,
		"utils.createGitService.set" /* callName */,
		3 /* maxRetries */,
		1000 /* retryAfterMs */,
		getLumberBaseProperties(documentId, tenantId) /* telemetryProperties */,
	).catch((error) => {
		Lumberjack.error(
			"Error setting isEphemeral flag in cache.",
			{ ...getLumberBaseProperties(documentId, tenantId), isEphemeralKey },
			error,
		);
	});
}

async function getDocumentCachedEphemeralProperties(
	cache: ICache | undefined,
	documentId: string,
	tenantId: string,
): Promise<boolean | undefined> {
	if (!cache) {
		Lumberjack.warning("Cache not provided. Skipping ephemeral cache check.", {
			...getLumberBaseProperties(documentId, tenantId),
		});
		return undefined;
	}
	const isEphemeralKey: string = getEphemeralContainerCacheKey(documentId);
	try {
		const cachedIsEphemeral = await runWithRetry(
			async () => cache?.get(isEphemeralKey) /* api */,
			"utils.createGitService.get" /* callName */,
			3 /* maxRetries */,
			1000 /* retryAfterMs */,
			getLumberBaseProperties(documentId, tenantId) /* telemetryProperties */,
		);
		if (typeof cachedIsEphemeral === "boolean") {
			return cachedIsEphemeral;
		}
	} catch (error) {
		Lumberjack.error(
			"Error getting isEphemeral flag from cache.",
			{ ...getLumberBaseProperties(documentId, tenantId), isEphemeralKey },
			error,
		);
	}
	return undefined;
}

/**
 * Whether a document is an Ephemeral Container and when it was created.
 * If the document does not exist or an error is encountered when accessing the document,
 * the document is considered _not_ ephemeral, with an undefined create time.
 *
 * If the document exists and the isEphemeralContainer flag is not set, the document is considered _not_ ephemeral.
 */
async function getDocumentStaticEphemeralProperties(
	documentManager: IDocumentManager,
	tenantId: string,
	documentId: string,
): Promise<{ isEphemeralContainer: boolean; createTime: number | undefined }> {
	try {
		const staticProps = await runWithRetry(
			async () => documentManager.readStaticProperties(tenantId, documentId) /* api */,
			"utils.createGitService.readStaticProperties" /* callName */,
			3 /* maxRetries */,
			1000 /* retryAfterMs */,
			getLumberBaseProperties(documentId, tenantId) /* telemetryProperties */,
		);
		if (!staticProps) {
			Lumberjack.error(
				`Static data not found when checking isEphemeral flag.`,
				getLumberBaseProperties(documentId, tenantId),
			);
			return { isEphemeralContainer: false, createTime: undefined };
		}
		return {
			isEphemeralContainer: staticProps.isEphemeralContainer ?? false,
			createTime: staticProps.createTime,
		};
	} catch (error) {
		Lumberjack.error(
			`Failed to retrieve static data from document when checking isEphemeral flag.`,
			getLumberBaseProperties(documentId, tenantId),
			error,
		);
		return { isEphemeralContainer: false, createTime: undefined };
	}
}

/**
 * Checks the cache for the isEphemeral flag for the given document. If the flag is not in the cache, it fetches the
 * static data from the document and caches the flag.
 *
 * Returns false if the flag is not found in the static data will cause Ephemeral Container access
 * to fail, which is better than returning true and causing durable container access to fail.
 * Ephemeral containers do not have as strong of an SLA as durable containers, so this is the safer choice.
 *
 * @returns - Returns a boolean indicating whether the container is ephemeral or not.
 * @throws - Throws an error if falling back to static data indicates an ephemeral document is older than the provided
 * max ephemeral document TTL.
 */
async function checkAndCacheIsEphemeral({
	documentId,
	tenantId,
	documentManager,
	ephemeralDocumentTTLSec,
	isEphemeralContainerOverride,
	cache,
}: {
	documentId: string;
	tenantId: string;
	documentManager: IDocumentManager;
	ephemeralDocumentTTLSec: number;
	isEphemeralContainerOverride?: boolean;
	cache?: ICache;
}): Promise<boolean> {
	if (typeof isEphemeralContainerOverride === "boolean") {
		// If an isEphemeralContainerOverride flag was passed in, cache it and return it.
		// This typically happens on the first request to the document.
		await updateIsEphemeralCache(documentId, tenantId, isEphemeralContainerOverride, cache);
		return isEphemeralContainerOverride;
	}
	// When no override is provided, check the cache first.
	const cachedIsEphemeral: boolean | undefined = await getDocumentCachedEphemeralProperties(
		cache,
		documentId,
		tenantId,
	);
	if (cachedIsEphemeral !== undefined) {
		return cachedIsEphemeral;
	}

	// Finally, if isEphemeral was not in the cache, fetch the value from database.
	const { isEphemeralContainer: staticPropsIsEphemeral, createTime } =
		await getDocumentStaticEphemeralProperties(documentManager, tenantId, documentId);

	if (staticPropsIsEphemeral === true && createTime !== undefined) {
		// Explicitly check for ephemeral document expiration.
		const currentTime = Date.now();
		const documentExpirationTime = createTime + ephemeralDocumentTTLSec * 1000;
		if (currentTime > documentExpirationTime) {
			// If the document is ephemeral and older than the max ephemeral document TTL, throw an error indicating that it can't be accessed.
			const documentExpiredByMs = currentTime - documentExpirationTime;
			// TODO: switch back to "Ephemeral Container Expired" once clients update to use errorType, not error message. AB#12867
			const error = new NetworkError(404, "Document is deleted and cannot be accessed.");
			Lumberjack.warning(
				"Document is older than the max ephemeral document TTL.",
				{
					...getLumberBaseProperties(documentId, tenantId),
					documentCreateTime: createTime,
					documentExpirationTime,
					documentExpiredByMs,
				},
				error,
			);
			throw error;
		}
	}
	await updateIsEphemeralCache(documentId, tenantId, staticPropsIsEphemeral, cache);
	return staticPropsIsEphemeral;
}

export async function createGitService(createArgs: ICreateGitServiceArgs): Promise<RestGitService> {
	const {
		config,
		tenantId,
		authorization,
		tenantService,
		storageNameRetriever,
		documentManager,
		cache,
		initialUpload,
		storageName,
		allowDisabledTenant,
		isEphemeralContainer,
		ephemeralDocumentTTLSec,
		denyList,
		simplifiedCustomDataRetriever,
	} = { ...defaultCreateGitServiceArgs, ...createArgs };
	if (!authorization) {
		throw new NetworkError(403, "Authorization header is missing.");
	}
	const token = parseToken(tenantId, authorization);
	if (!token) {
		throw new NetworkError(403, "Authorization token is missing.");
	}
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
	const simplifiedCustomData = simplifiedCustomDataRetriever?.get(customData);
	const writeToExternalStorage = !!customData?.externalStorageData;
	const storageUrl = config.get("storageUrl") as string | undefined;
	const ignoreEphemeralFlag: boolean = config.get("ignoreEphemeralFlag");
	const maxCacheableSummarySize: number =
		config.get("restGitService:maxCacheableSummarySize") ?? 1_000_000_000; // default: 1gb

	const isEphemeral: boolean = ignoreEphemeralFlag
		? false
		: await checkAndCacheIsEphemeral({
				documentId,
				tenantId,
				documentManager,
				ephemeralDocumentTTLSec,
				isEphemeralContainerOverride: isEphemeralContainer,
				cache,
		  });
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
		calculatedStorageName,
		storageUrl,
		isEphemeral,
		maxCacheableSummarySize,
		simplifiedCustomData,
	);
	return service;
}

/**
 * Helper function to convert Request's query param to a number.
 * @param value - The value to be converted to number.
 */
export function queryParamToNumber(value: any): number | undefined {
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
export function queryParamToString(value: any): string | undefined {
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
			if (!authorization) {
				throw new NetworkError(403, "Authorization header is missing.");
			}
			const token = parseToken(reqTenantId, authorization);
			if (!token) {
				throw new NetworkError(403, "Authorization token is missing.");
			}
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

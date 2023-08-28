/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { RequestHandler, Response } from "express";
import { decode } from "jsonwebtoken";
import * as nconf from "nconf";
import { ITokenClaims } from "@fluidframework/protocol-definitions";
import { NetworkError } from "@fluidframework/server-services-client";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { IStorageNameRetriever, IRevokedTokenChecker } from "@fluidframework/server-services-core";
import {
	ICache,
	ITenantService,
	RestGitService,
	ITenantCustomDataExternal,
	IDenyList,
} from "../services";
import { containsPathTraversal, parseToken } from "../utils";

/**
 * Helper function to handle a promise that should be returned to the user.
 * TODO: Replace with handleResponse from services-shared.
 * @param resultP - Promise whose resolved value or rejected error will send with appropriate status codes.
 * @param response - Express Response used for writing response body, headers, and status.
 * @param allowClientCache - sends Cache-Control header with maximum age set to 1 yr if true or no store if false.
 * @param errorStatus - Overrides any error status code; leave undefined for pass-through error codes or 400 default.
 * @param successStatus - Status to send when result is successful. Default: 200
 * @param onSuccess - Additional callback fired when response is successful before sending response.
 */
export function handleResponse<T>(
	resultP: Promise<T>,
	response: Response,
	allowClientCache?: boolean,
	errorStatus?: number,
	successStatus: number = 200,
	onSuccess: (value: T) => void = () => {},
) {
	resultP
		.then((result) => {
			if (allowClientCache === true) {
				response.setHeader("Cache-Control", "public, max-age=31536000");
			} else if (allowClientCache === false) {
				response.setHeader("Cache-Control", "no-store, max-age=0");
			}
			// Make sure the browser will expose specific headers for performance analysis.
			response.setHeader(
				"Access-Control-Expose-Headers",
				"Content-Encoding, Content-Length, Content-Type",
			);
			// In order to report W3C timings, Time-Allow-Origin needs to be set.
			response.setHeader("Timing-Allow-Origin", "*");
			onSuccess(result);
			// Express' json call below will set the content-length.
			response.status(successStatus).json(result);
		})
		.catch((error) => {
			// Only log unexpected errors on the assumption that explicitly thrown
			// NetworkErrors have additional logging in place at the source.
			if (error instanceof Error && error?.name === "NetworkError") {
				const networkError = error as NetworkError;
				response
					.status(errorStatus ?? networkError.code ?? 400)
					.json(networkError.details ?? error);
			} else {
				// Mask unexpected internal errors in outgoing response.
				Lumberjack.error("Unexpected error when processing HTTP Request", undefined, error);
				response.status(errorStatus ?? 400).json("Internal Server Error");
			}
		});
}

export class createGitServiceArgs {
	config: nconf.Provider;
	tenantId: string;
	authorization: string;
	tenantService: ITenantService;
	storageNameRetriever: IStorageNameRetriever;
	cache?: ICache;
	asyncLocalStorage?: AsyncLocalStorage<string>;
	initialUpload?: boolean = false;
	storageName?: string;
	allowDisabledTenant?: boolean = false;
	isEphemeralContainer?: boolean = false;
	ignoreEphemeralFlag?: boolean = true;
	denyList?: IDenyList;
}

export async function createGitService(createArgs: createGitServiceArgs): Promise<RestGitService> {
	const {
		config,
		tenantId,
		authorization,
		tenantService,
		storageNameRetriever,
		cache,
		asyncLocalStorage,
		initialUpload,
		storageName,
		allowDisabledTenant,
		isEphemeralContainer,
		ignoreEphemeralFlag,
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
	const maxCacheableSummarySize: number =
		config.get("restGitService:maxCacheableSummarySize") ?? 1_000_000_000; // default: 1gb

	let isEphemeral = cache ? isEphemeralContainer : false;
	if (!ignoreEphemeralFlag) {
		if (isEphemeralContainer !== undefined) {
			await cache?.set(`isEphemeral:${documentId}`, isEphemeralContainer);
		} else {
			isEphemeral = await cache?.get(`isEphemeral:${documentId}`);
			// Todo: If isEphemeral is still undefined fetch the value from database
		}
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

/**
 * Validate specific request parameters to prevent directory traversal.
 * TODO: replace with validateRequestParams from service-shared.
 */
export function validateRequestParams(...paramNames: (string | number)[]): RequestHandler {
	return (req, res, next) => {
		for (const paramName of paramNames) {
			const param = req.params[paramName];
			if (!param) {
				continue;
			}
			if (containsPathTraversal(param)) {
				return handleResponse(
					Promise.reject(new NetworkError(400, `Invalid ${paramName}: ${param}`)),
					res,
				);
			}
		}
		next();
	};
}

export function verifyTokenNotRevoked(
	revokedTokenChecker: IRevokedTokenChecker | undefined,
): RequestHandler {
	return async (request, response, next) => {
		try {
			if (revokedTokenChecker) {
				const tenantId = request.params.tenantId;
				const authorization = request.get("Authorization");
				const token = parseToken(tenantId, authorization);
				const claims = decode(token) as ITokenClaims;

				let isTokenRevoked = false;
				if (claims.jti) {
					isTokenRevoked = await revokedTokenChecker.isTokenRevoked(
						tenantId,
						claims.documentId,
						claims.jti,
					);
				}

				if (isTokenRevoked) {
					throw new NetworkError(
						403,
						"Permission denied. Token has been revoked.",
						false /* canRetry */,
						true /* isFatal */,
					);
				}
			}
			next();
		} catch (error) {
			return handleResponse(Promise.reject(error), response);
		}
	};
}

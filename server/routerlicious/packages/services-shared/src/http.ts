/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "path";
import { NetworkError, getNetworkInformationFromIP } from "@fluidframework/server-services-client";
import type { RequestHandler, Response } from "express";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { ITenantManager, type ITenantConfig } from "@fluidframework/server-services-core";
/**
 * Check a given path string for path traversal (e.g. "../" or "/").
 * @internal
 */
export function containsPathTraversal(path: string): boolean {
	const parsedPath = parse(path);
	return parsedPath.dir.includes("..") || parsedPath.dir.startsWith("/");
}

/**
 * Validate specific request parameters to prevent directory traversal.
 * @internal
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

/**
 * Validate private link.
 * @internal
 */
export function validatePrivateLink(
	tenantManager: ITenantManager,
	clusterHost: string,
	enableNetworkCheck: boolean = false,
): RequestHandler {
	return async (req, res, next) => {
		if (enableNetworkCheck) {
			const tenantId = req.params.tenantId;
			if (!tenantId) {
				next();
			}
			const clientIPAddress = req.ip ? req.ip : "";
			const result = getNetworkInformationFromIP(clientIPAddress);
			const tenantInfo: ITenantConfig = await tenantManager.getTenantfromRiddler(tenantId);
			const privateLinkEnable = tenantInfo?.customData?.accountLinkIds ? true : false;
			if (result.isPrivateLink) {
				if (privateLinkEnable) {
					const accountLinkIds = JSON.parse(tenantInfo?.customData?.accountLinkIds);
					if (Object.prototype.hasOwnProperty.call(accountLinkIds, clusterHost)) {
						const accountLinkId = accountLinkIds[clusterHost];
						if (result.privateLinkId === accountLinkId) {
							Lumberjack.info("This is a private link request", {
								tenantId,
								clientIPAddress,
							});
						} else {
							return handleResponse(
								Promise.reject(
									new NetworkError(
										400,
										`This private link should not be connected since the link id does not match`,
									),
								),
								res,
							);
						}
					}
				} else {
					return handleResponse(
						Promise.reject(
							new NetworkError(
								400,
								`This private link should not be connected since the tenant is not private link enabled`,
							),
						),
						res,
					);
				}
			} else {
				if (privateLinkEnable) {
					return handleResponse(
						Promise.reject(
							new NetworkError(
								400,
								`This is the public network ${clientIPAddress} called from the private link tenant ${tenantId}`,
							),
						),
						res,
					);
				}
			}
		}
		next();
	};
}

/**
 * Converts the request param to a boolean
 * @internal
 */
export function getBooleanParam(param: any): boolean {
	return param === undefined ? false : typeof param === "boolean" ? param : param === "true";
}

/**
 * Default error message sent to API consumer when an unknown error is encountered.
 * @internal
 */
export const defaultErrorMessage = "Internal Server Error";

/**
 * Header to denote that the container is ephemeral.
 * @internal
 */
export const IsEphemeralContainer = "Is-Ephemeral-Container";

/**
 * Helper function to handle a promise that should be returned to the user.
 * @param resultP - Promise whose resolved value or rejected error will send with appropriate status codes.
 * @param response - Express Response used for writing response body, headers, and status.
 * @param allowClientCache - sends Cache-Control header with maximum age set to 1 yr if true or no store if false.
 * @param errorStatus - Overrides any error status code; leave undefined for pass-through error codes or 400 default.
 * @param successStatus - Status to send when result is successful. Default: 200
 * @param onSuccess - Additional callback fired when response is successful before sending response.
 * @internal
 */
export function handleResponse<T>(
	resultP: Promise<T>,
	response: Response,
	allowClientCache?: boolean,
	errorStatus?: number,
	successStatus: number = 200,
	onSuccess: (value: T) => void = () => {},
	onError: (error: any) => void = () => {},
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
			onError(error);
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
				response.status(errorStatus ?? 400).json(defaultErrorMessage);
			}
		});
}

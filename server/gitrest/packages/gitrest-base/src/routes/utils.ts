/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Request, RequestHandler } from "express";

export enum ApiVersion {
	V1 = "1.0",
	V2 = "2.0",
}
function isValidApiVersion(version: unknown): version is ApiVersion {
	return version === ApiVersion.V1 || version === ApiVersion.V2;
}
export function getApiVersion(req: Request): ApiVersion {
	const queryParamApiVersion = req.query["api-version"];
	if (isValidApiVersion(queryParamApiVersion)) {
		return queryParamApiVersion;
	}
	return ApiVersion.V1;
}
/**
 * Middleware wrapper to restrict middleware use to a specific API version.
 */
export function apiVersionRestrictedMiddleware(
	apiVersion: ApiVersion,
	restrictedMiddleware: RequestHandler,
): RequestHandler {
	return (req: Request, res, next) => {
		if (getApiVersion(req) === apiVersion) {
			return restrictedMiddleware(req, res, next);
		}
		return next();
	};
}

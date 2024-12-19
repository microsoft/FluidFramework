/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "path";
// In this case we want @types/express-serve-static-core, not express-serve-static-core, and so disable the lint rule
// eslint-disable-next-line import/no-unresolved
import { Params } from "express-serve-static-core";
import { getParam } from "@fluidframework/server-services-utils";
import { ITokenClaims } from "@fluidframework/protocol-definitions";
import { NetworkError } from "@fluidframework/server-services-client";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { decode } from "jsonwebtoken";
import winston from "winston";
import safeStringify from "json-stringify-safe";

export function normalizePort(val) {
	const normalizedPort = parseInt(val, 10);

	if (isNaN(normalizedPort)) {
		// named pipe
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return val;
	}

	if (normalizedPort >= 0) {
		// port number
		return normalizedPort;
	}

	return false;
}

export const Constants = Object.freeze({
	historianRestThrottleIdSuffix: "HistorianRest",
	createSummaryThrottleIdPrefix: "createSummary",
	getSummaryThrottleIdPrefix: "getSummary",
	generalRestCallThrottleIdPrefix: "generalRestCall",
	IsEphemeralContainer: "Is-Ephemeral-Container",
	isInitialSummary: "isInitialSummary",
	SimplifiedCustomData: "SimplifiedCustomData",
});

export function getTokenLifetimeInSec(token: string): number | undefined {
	const claims = decode(token) as ITokenClaims;
	if (claims?.exp) {
		return claims.exp - Math.round(new Date().getTime() / 1000);
	}
	return undefined;
}

export function getTenantIdFromRequest(params: Params) {
	const tenantId = getParam(params, "tenantId");
	if (tenantId !== undefined) {
		return tenantId;
	}
	const id = getParam(params, "id");
	if (id !== undefined) {
		return id;
	}

	return "-";
}

export function getDocumentIdFromRequest(tenantId: string, authorization: string | undefined) {
	if (!authorization) {
		return "-";
	}
	try {
		const token = parseToken(tenantId, authorization);
		const decoded = decode(token) as ITokenClaims;
		return decoded.documentId;
	} catch (err) {
		return "-";
	}
}

export function parseToken(
	tenantId: string,
	authorization: string | undefined,
): string | undefined {
	let token: string | undefined;
	if (authorization) {
		const base64TokenMatch = authorization.match(/Basic (.+)/);
		if (!base64TokenMatch) {
			throw new NetworkError(403, "Malformed authorization token");
		}
		const encoded = Buffer.from(base64TokenMatch[1], "base64").toString();

		const tokenMatch = encoded.match(/(.+):(.+)/);
		if (!tokenMatch || tenantId !== tokenMatch[1]) {
			throw new NetworkError(403, "Malformed authorization token");
		}

		token = tokenMatch[2];
	}

	return token;
}

/**
 * Check a given path string for path traversal (e.g. "../" or "/").
 * TODO: replace with containsPathTraversal from services-shared
 */
export function containsPathTraversal(path: string): boolean {
	const parsedPath = parse(path);
	return parsedPath.dir.includes("..") || parsedPath.dir.startsWith("/");
}

/**
 * Pass into `.catch()` block of a RestWrapper call to output a more standardized network error.
 * @param url - request url to be output in error log
 * @param method - request method (e.g. "GET", "POST") to be output in error log
 * @param lumberProperties - Collection of Lumberjack telemetry properties associated with the request
 */
export function getRequestErrorTranslator(
	url: string,
	method: string,
	lumberProperties?: Map<string, any> | Record<string, any>,
): (error: any) => never {
	const standardLogErrorMessage = `[${method}] Request to [${url}] failed`;
	const requestErrorTranslator = (error: any): never => {
		if (typeof error === "object" && error instanceof Error && error.name === "NetworkError") {
			// BasicRestWrapper throws NetworkErrors that describe the error details associated with the network call.
			// Here, we log information associated with the error for debugging purposes, and re-throw.
			const networkError = error as NetworkError;
			winston.error(
				`${standardLogErrorMessage}: [statusCode: ${networkError.code}], [details: ${
					safeStringify(networkError.details) ?? "undefined"
				}]`,
			);
			Lumberjack.error(
				`${standardLogErrorMessage}: [statusCode: ${networkError.code}], [details: ${
					safeStringify(networkError.details) ?? "undefined"
				}]`,
				lumberProperties,
			);
			throw error;
		} else if (typeof error === "number" || !Number.isNaN(Number.parseInt(error, 10))) {
			// The legacy implementation of BasicRestWrapper used to throw status codes only, when status codes
			// were available. Here, we deal with that legacy scenario, logging the error information and throwing
			// a new NetworkError based on it.
			const errorCode = typeof error === "number" ? error : Number.parseInt(error, 10);
			winston.error(`${standardLogErrorMessage}: [statusCode: ${errorCode}]`);
			Lumberjack.error(
				`${standardLogErrorMessage}: [statusCode: ${errorCode}]`,
				lumberProperties,
			);
			throw new NetworkError(errorCode, "Internal Service Request Failed");
		}

		// Treat anything else as an internal error, but log for debugging purposes
		winston.error(`${standardLogErrorMessage}: ${safeStringify(error)}`);
		Lumberjack.error(standardLogErrorMessage, lumberProperties, error);
		throw new NetworkError(500, "Internal Server Error");
	};
	return requestErrorTranslator;
}

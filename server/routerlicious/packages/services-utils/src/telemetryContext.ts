/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import type { RequestHandler, Request, Response } from "express";
import {
	CorrelationIdHeaderName,
	TelemetryContextHeaderName,
} from "@fluidframework/server-services-client";
import {
	BaseTelemetryProperties,
	ITelemetryContextProperties,
	isTelemetryContextProperties,
	getGlobalTelemetryContext,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";

/**
 * Safely parse telemetry context properties from a string.
 */
function parseTelemetryContextHeader(
	telemetryContextHeader: string | undefined,
): Partial<ITelemetryContextProperties> | undefined {
	if (!telemetryContextHeader) {
		return undefined;
	}
	try {
		const telemetryContextProperties = JSON.parse(telemetryContextHeader);
		if (isTelemetryContextProperties(telemetryContextProperties)) {
			return telemetryContextProperties;
		}
	} catch (error) {
		Lumberjack.warning("Received invalid telemetry context properties", undefined, error);
	}
}

/**
 * Retrieve telemetry properties from an HTTP request.
 * Specifically, gets CorrelationId from x-correlation-id header and TelemetryContext from x-telemetry-context header.
 */
function getTelemetryContextPropertiesFromRequest(
	req: Request,
	res: Response,
): Partial<ITelemetryContextProperties> {
	const correlationIdHeader =
		req.get(CorrelationIdHeaderName) ?? res.get(CorrelationIdHeaderName);
	const telemetryContextHeader =
		req.get(TelemetryContextHeaderName) ?? res.get(TelemetryContextHeaderName);
	// Safely parse and return accepted telemetry properties.
	const telemetryContextProperties = parseTelemetryContextHeader(telemetryContextHeader);
	/**
	 * Determines the source of the request based on the request headers.
	 * If TelemetryContextHeaderName is present in the request headers,
	 * the source is considered as "server". Otherwise, it is considered as "client".
	 */
	const requestSource = req.get(TelemetryContextHeaderName) !== undefined ? "server" : "client";
	return {
		[BaseTelemetryProperties.correlationId]:
			telemetryContextProperties?.correlationId ?? correlationIdHeader,
		[BaseTelemetryProperties.tenantId]: telemetryContextProperties?.tenantId,
		[BaseTelemetryProperties.documentId]: telemetryContextProperties?.documentId,
		[BaseTelemetryProperties.requestSource]: requestSource,
	};
}

/**
 * TelemetryContext helper that checks HTTP request and response for {@link TelemetryContextHeaderName} header
 * and returns global telemetry context properties with those request context properties included if they exist.
 * @internal
 */
export function getTelemetryContextPropertiesWithHttpInfo(
	req: Request,
	res: Response,
): Partial<ITelemetryContextProperties> {
	const telemetryContextProperties = getGlobalTelemetryContext().getProperties();
	const httpProperties = getTelemetryContextPropertiesFromRequest(req, res);
	const properties: Partial<ITelemetryContextProperties> = {
		...httpProperties,
		...telemetryContextProperties,
	};
	return properties;
}

/**
 * Express.js Middleware that binds the global telemetry context to the request for its lifetime.
 *
 * Specific telemetry context properties will be set in the response headers.
 * - {@link CorrelationIdHeaderName}: correlationId
 *
 * Requests from the Fluid client may not include a correlationId, so one is generated when unavailable.
 * @internal
 */
export const bindTelemetryContext = (): RequestHandler => {
	return (req, res, next) => {
		const telemetryContext = getGlobalTelemetryContext();
		// Bind incoming telemetry properties to async context.
		const telemetryContextProperties = getTelemetryContextPropertiesWithHttpInfo(req, res);
		// Generate entry correlation-id if not provided in request.
		if (!telemetryContextProperties.correlationId) {
			telemetryContextProperties.correlationId = uuid();
		}
		// Assign response headers for client telemetry purposes.
		res.setHeader(CorrelationIdHeaderName, telemetryContextProperties.correlationId);
		telemetryContext.bindProperties(telemetryContextProperties, () => next());
	};
};

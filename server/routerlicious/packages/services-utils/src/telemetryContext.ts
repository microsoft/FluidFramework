/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import type { RequestHandler, Request, Response } from "express";
import { CorrelationIdHeaderName } from "@fluidframework/server-services-client";
import {
	BaseTelemetryProperties,
	ITelemetryContextProperties,
	getGlobalTelemetryContext,
} from "@fluidframework/server-services-telemetry";

/**
 * Retrieve telemetry properties from an HTTP request.
 * For example, gets CorrelationId from x-correlation-id header.
 */
function getTelemetryContextPropertiesFromRequest(
	req: Request,
	res: Response,
): Partial<ITelemetryContextProperties> {
	const correlationIdHeader =
		req.get(CorrelationIdHeaderName) ?? res.get(CorrelationIdHeaderName);
	// Safely parse and return accepted telemetry properties.
	return {
		[BaseTelemetryProperties.correlationId]: correlationIdHeader,
	};
}

/**
 * TelemetryContext helper that checks HTTP request and response for {@link TelemetryContextHeaderName} header
 * and returns global telemetry context properties with those request context properties included if they exist.
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

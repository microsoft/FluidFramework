/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import type { Request, Response, NextFunction } from "express";
import { CorrelationIdHeaderName } from "@fluidframework/server-services-client";
import { getGlobalTelemetryContext } from "@fluidframework/server-services-telemetry";
import { getTelemetryContextPropertiesWithHttpInfo } from "./telemetryContext";

/**
 * DEPRECATED
 * ----------
 * The following are deprecated AsyncLocalStorage implementations for correlationId.
 * See ./asyncContext.ts for new AsyncLocalStorage implementation for global telemetry context.
 */

const defaultAsyncLocalStorage = new AsyncLocalStorage<string>();

/**
 * @deprecated Use `getGlobalTelemetryContext().getProperties().correlationId` instead
 * @internal
 */
export function getCorrelationId(
	altAsyncLocalStorage?: AsyncLocalStorage<string>,
): string | undefined {
	// Attempt to get correlationId using global telemetry context.
	const telemetryContextProperties = getGlobalTelemetryContext().getProperties();
	const telemetryContextCorrelationId: string | undefined =
		telemetryContextProperties?.correlationId;
	if (telemetryContextCorrelationId) {
		return telemetryContextCorrelationId;
	}
	// Fallback to using non-global async local storage.
	return altAsyncLocalStorage
		? altAsyncLocalStorage.getStore()
		: defaultAsyncLocalStorage.getStore();
}

/**
 * @deprecated Use `getTelemetryContextPropertiesWithHttpInfo().correlationId` instead
 * @internal
 */
export function getCorrelationIdWithHttpFallback(
	req: Request,
	res: Response,
	altAsyncLocalStorage?: AsyncLocalStorage<string>,
): string | undefined {
	// Attempt to get correlationId using global telemetry context.
	const telemetryContextProperties = getTelemetryContextPropertiesWithHttpInfo(req, res);
	const telemetryContextCorrelationId: string | undefined =
		telemetryContextProperties.correlationId;
	if (telemetryContextCorrelationId) {
		return telemetryContextCorrelationId;
	}
	// Fallback to using non-global async local storage.
	return (
		getCorrelationId(altAsyncLocalStorage) ??
		req.get(CorrelationIdHeaderName) ??
		res.get(CorrelationIdHeaderName)
	);
}

/**
 * @deprecated use `bindTelemetryContext()` instead
 * @internal
 */
export const bindCorrelationId =
	(
		altAsyncLocalStorage?: AsyncLocalStorage<string>,
		headerName: string = CorrelationIdHeaderName,
	) =>
	(req: Request, res: Response, next: NextFunction): void => {
		const telemetryContextProperties = getTelemetryContextPropertiesWithHttpInfo(req, res);
		const id: string =
			telemetryContextProperties.correlationId ??
			req.header(headerName) ??
			crypto.randomUUID();
		res.setHeader(headerName, id);
		if (altAsyncLocalStorage) {
			altAsyncLocalStorage.run(id, () => next());
		} else {
			defaultAsyncLocalStorage.run(id, () => next());
		}
	};

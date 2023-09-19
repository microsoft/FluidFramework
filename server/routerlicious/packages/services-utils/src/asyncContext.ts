/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { v4 as uuid } from "uuid";
import type { RequestHandler, Request, Response } from "express";
import { CorrelationIdHeaderName } from "@fluidframework/server-services-client";
import {
	BaseTelemetryProperties,
	ITelemetryContextProperties,
	getGlobalTelemetryContext,
	ITelemetryContext,
} from "@fluidframework/server-services-telemetry";

export class AsyncLocalStorageContextProvider<T> {
	private readonly asyncLocalStorage = new AsyncLocalStorage<T>();

	/**
	 * Bind new properties to the asynchronous context.
	 * If properties are a key-value record, new entries will be appended to the existing record.
	 * Otherwise, the old context will be overwritten with the new context.
	 */
	public bindContext(props: T, callback: () => void): void {
		// Extend existing properties if props are a key-value record.
		// Otherwise, overwrite existing props with new props.
		const existingProps = this.getContext();
		const newProperties: T =
			typeof props === "object" && !Array.isArray(props)
				? { ...existingProps, ...props }
				: props;
		// Anything within callback context will have access to properties.
		this.asyncLocalStorage.run(newProperties, () => callback());
	}

	/**
	 * Get any properties bound to the asynchronous context.
	 */
	public getContext(): T | undefined {
		return this.asyncLocalStorage.getStore();
	}
}

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
		if (!telemetryContext) {
			return next();
		}
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

export class AsyncLocalStorageTelemetryContext implements ITelemetryContext {
	private readonly contextProvider = new AsyncLocalStorageContextProvider<
		Partial<ITelemetryContextProperties>
	>();

	public getProperties(): Partial<ITelemetryContextProperties> {
		return this.contextProvider.getContext() ?? {};
	}

	public bindProperties(props: Partial<ITelemetryContextProperties>, callback: () => void): void {
		this.contextProvider.bindContext(props, () => callback());
	}

	public async bindPropertiesAsync<T>(
		props: Partial<ITelemetryContextProperties>,
		callback: () => Promise<T>,
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.contextProvider.bindContext(props, () => {
				callback().then(resolve).catch(reject);
			});
		});
	}
}

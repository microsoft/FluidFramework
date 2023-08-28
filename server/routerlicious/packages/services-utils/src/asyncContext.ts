/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { v4 as uuid } from "uuid";
import type { RequestHandler, Request, Response } from "express";
import {
	CorrelationIdHeaderName,
	TelemetryContextHeaderName,
} from "@fluidframework/server-services-client";
import {
	BaseTelemetryProperties,
	ITelemetryContextProperties,
	Lumberjack,
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
	res?: Response,
): Partial<ITelemetryContextProperties> {
	const telemetryContextHeader: string | string[] | undefined =
		req?.get(TelemetryContextHeaderName) ?? res?.get(TelemetryContextHeaderName);
	if (!telemetryContextHeader || Array.isArray(telemetryContextHeader)) {
		return {};
	}
	// Safely parse and return accepted telemetry properties.
	try {
		const telemetryContextProperties: Partial<ITelemetryContextProperties> =
			JSON.parse(telemetryContextHeader);
		return {
			[BaseTelemetryProperties.correlationId]: telemetryContextProperties.correlationId,
			[BaseTelemetryProperties.tenantId]: telemetryContextProperties.tenantId,
			[BaseTelemetryProperties.documentId]: telemetryContextProperties.documentId,
		};
	} catch (e) {
		Lumberjack.error(
			`Received invalid TelemetryContext header: ${telemetryContextHeader}`,
			undefined,
			e,
		);
		return {};
	}
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
 * Telemetry context properties will be set by the incoming request's {@link TelemetryContextHeaderName} header
 * and any existing properties in the global telemetry context, in that order.
 *
 * Before the response is sent to client, the {@link TelemetryContextHeaderName} response header is set
 * with properties from the global telemetry context.
 * To maintain compatibility with clients that still look for a {@link CorrelationIdHeaderName} header,
 * the {@link CorrelationIdHeaderName} header will be set if correlationId is present in the global telemetry context properties.
 */
export const bindTelemetryContext = (): RequestHandler => {
	return (req, res, next) => {
		const telemetryContext = getGlobalTelemetryContext();
		if (!telemetryContext) {
			return next();
		}
		// Hijack res.send to add latest telemetry context before completing response.
		const _send = res.send;
		res.send = (body?: any) => {
			const properties = getGlobalTelemetryContext().getProperties();
			res.setHeader(TelemetryContextHeaderName, JSON.stringify(properties));
			if (properties.correlationId) {
				// Ensure backwards compatibility with correlation-id.
				res.setHeader(CorrelationIdHeaderName, properties.correlationId);
			}
			return _send(body);
		};
		// Bind incoming telemetry properties to async context
		const telemetryContextProperties = getTelemetryContextPropertiesFromRequest(req);
		// Generate entry correlation-id if not provided in request.
		if (!telemetryContextProperties.correlationId) {
			telemetryContextProperties.correlationId = uuid();
		}
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

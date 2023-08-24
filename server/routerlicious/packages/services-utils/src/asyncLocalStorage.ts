/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import * as uuid from "uuid";
import { Request, Response, NextFunction } from "express";
import { CorrelationIdHeaderName } from "@fluidframework/server-services-client";
import {
	ITelemetryContextProperties,
	ITelemetryContextPropertyProvider,
	getGlobalTelemetryContext,
} from "@fluidframework/server-services-telemetry";

const defaultAsyncLocalStorage = new AsyncLocalStorage<string>();

export function getCorrelationId(
	altAsyncLocalStorage?: AsyncLocalStorage<string>,
): string | undefined {
	return altAsyncLocalStorage
		? altAsyncLocalStorage.getStore()
		: defaultAsyncLocalStorage.getStore();
}

export function getCorrelationIdWithHttpFallback(
	req: Request,
	res: Response,
	altAsyncLocalStorage?: AsyncLocalStorage<string>,
): string | undefined {
	return (
		getCorrelationId(altAsyncLocalStorage) ??
		req.get(CorrelationIdHeaderName) ??
		res.get(CorrelationIdHeaderName)
	);
}

export const bindCorrelationId =
	(
		altAsyncLocalStorage?: AsyncLocalStorage<string>,
		headerName: string = CorrelationIdHeaderName,
	) =>
	(req: Request, res: Response, next: NextFunction): void => {
		const id: string = req.header(headerName) ?? uuid.v4();
		res.setHeader(headerName, id);
		if (altAsyncLocalStorage) {
			altAsyncLocalStorage.run(id, () => next());
		} else {
			defaultAsyncLocalStorage.run(id, () => next());
		}
	};

export class AsyncLocalStorageContextProvider implements ITelemetryContextPropertyProvider {
	private readonly asyncLocalStorage = new AsyncLocalStorage<
		Partial<ITelemetryContextProperties>
	>();
	public bindContextualProperties(
		props: Partial<ITelemetryContextProperties>,
		callback: () => void,
	): void {
		const existingProps = this.getContextualProperties();
		const newProperties: Partial<ITelemetryContextProperties> = { ...existingProps, ...props };
		// Anything within callback context will have access to properties.
		this.asyncLocalStorage.run(newProperties, () => callback());
	}
	public getContextualProperties(): Partial<ITelemetryContextProperties> {
		const store: Partial<ITelemetryContextProperties> = this.asyncLocalStorage.getStore() ?? {};
		return store;
	}
}

const globalTelemetryContext = getGlobalTelemetryContext();
if (globalTelemetryContext) {
	globalTelemetryContext.telemetryContextPropertyProvider =
		new AsyncLocalStorageContextProvider();
}

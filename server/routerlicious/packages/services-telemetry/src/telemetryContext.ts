/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseTelemetryProperties } from "./resources";

/**
 * @internal
 */
export interface ITelemetryContextProperties {
	[BaseTelemetryProperties.tenantId]: string;
	[BaseTelemetryProperties.documentId]: string;
	[BaseTelemetryProperties.correlationId]: string;
	[BaseTelemetryProperties.requestSource]: string;
}

/**
 * @internal
 */
export function isTelemetryContextProperties(props: unknown): props is ITelemetryContextProperties {
	return (
		typeof props === "object" &&
		props !== null &&
		typeof props[BaseTelemetryProperties.tenantId] === "string" &&
		typeof props[BaseTelemetryProperties.documentId] === "string" &&
		typeof props[BaseTelemetryProperties.correlationId] === "string"
	);
}

/**
 * @internal
 */
export interface ITelemetryContext {
	/**
	 * Bind properties to context where `callback()` is executed.
	 * After this, `getProperties()` within `callback` will include `props`.
	 */
	bindProperties(props: Partial<ITelemetryContextProperties>, callback: () => void): void;
	/**
	 * Promisified {@link ITelemetryContext.bindProperties}.
	 */
	bindPropertiesAsync<T>(
		props: Partial<ITelemetryContextProperties>,
		callback: () => Promise<T>,
	): Promise<T>;
	/**
	 * Retrieve contextual properties for telemetry.
	 */
	getProperties(): Partial<ITelemetryContextProperties>;
}

export class NullTelemetryContext implements ITelemetryContext {
	public getProperties(): Partial<ITelemetryContextProperties> {
		return {};
	}

	public bindProperties(props: Partial<ITelemetryContextProperties>, callback: () => void): void {
		callback();
	}

	public async bindPropertiesAsync<T>(
		props: Partial<ITelemetryContextProperties>,
		callback: () => Promise<T>,
	): Promise<T> {
		return callback();
	}
}
const nullTelemetryContext = new NullTelemetryContext();

export const getGlobal = () => (typeof window !== "undefined" ? window : global);

/**
 * @internal
 */
export const getGlobalTelemetryContext = () =>
	(getGlobal().telemetryContext as ITelemetryContext | undefined) ?? nullTelemetryContext;

/**
 * @internal
 */
export const setGlobalTelemetryContext = (telemetryContext: ITelemetryContext) => {
	getGlobal().telemetryContext = telemetryContext;
};

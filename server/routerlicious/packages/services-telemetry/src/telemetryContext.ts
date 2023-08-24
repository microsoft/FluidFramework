/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "./lumberjack";
import { BaseTelemetryProperties } from "./resources";

export interface ITelemetryContextProperties {
	[BaseTelemetryProperties.tenantId]: string;
	[BaseTelemetryProperties.documentId]: string;
	[BaseTelemetryProperties.correlationId]: string;
}

export interface ITelemetryContextPropertyProvider {
	bindTelemetryContextProperties(
		props: Partial<ITelemetryContextProperties>,
		callback: () => void,
	): void;
	getTelemetryContextProperties(): Partial<ITelemetryContextProperties>;
}

export class TelemetryContext {
	private _lumberjackInstance: Lumberjack | undefined;
	private _telemetryContextPropertyProvider: ITelemetryContextPropertyProvider | undefined;

	public set lumberjackInstance(lumberjackInstance: Lumberjack | undefined) {
		if (!this._lumberjackInstance) {
			this._lumberjackInstance = lumberjackInstance;
		}
	}
	public get lumberjackInstance(): Lumberjack | undefined {
		return this._lumberjackInstance;
	}

	public set telemetryContextPropertyProvider(
		telemetryContextPropertyProvider: ITelemetryContextPropertyProvider,
	) {
		if (!this._telemetryContextPropertyProvider) {
			this._telemetryContextPropertyProvider = telemetryContextPropertyProvider;
		}
	}

	/**
	 * Retrieve contextual properties for telemetry.
	 */
	public getProperties(): Partial<ITelemetryContextProperties> {
		return this._telemetryContextPropertyProvider?.getTelemetryContextProperties() ?? {};
	}

	/**
	 * Bind properties to context.
	 */
	public bindProperties(props: Partial<ITelemetryContextProperties>, callback: () => void): void {
		this._telemetryContextPropertyProvider?.bindTelemetryContextProperties(props, callback);
	}
}

const getGlobal = () => (typeof window !== "undefined" ? window : global);

export const getGlobalTelemetryContext = () =>
	(getGlobal() as any).telemetryContext as TelemetryContext | undefined;

export const setGlobalTelemetryContext = (telemetryContext: TelemetryContext) => {
	(getGlobal() as any).telemetryContext = telemetryContext;
};

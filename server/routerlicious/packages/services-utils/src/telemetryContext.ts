/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Lumberjack,
	TelemetryContext,
	getGlobalTelemetryContext,
	setGlobalTelemetryContext,
} from "@fluidframework/server-services-telemetry";
import {
	AsyncLocalStorageContextProvider,
	getGlobalAsyncLocalStorageContextProvider,
	setGlobalAsyncLocalStorageContextProvider,
} from "./asyncLocalStorage";

export function configureGlobalContext() {
	if (getGlobalTelemetryContext() || getGlobalAsyncLocalStorageContextProvider()) {
		const error = new Error("Global context can only be configured once.");
		Lumberjack.error("Attempt to configure global context more than once.", error);
		throw error;
	}

	const globalAsyncLocalStorageContextProvider = new AsyncLocalStorageContextProvider();
	setGlobalAsyncLocalStorageContextProvider(globalAsyncLocalStorageContextProvider);

	const globalTelemetryContext = new TelemetryContext();
	globalTelemetryContext.telemetryContextPropertyProvider =
		globalAsyncLocalStorageContextProvider;
	setGlobalTelemetryContext(globalTelemetryContext);
}

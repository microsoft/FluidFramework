/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { setGlobalTelemetryContext } from "@fluidframework/server-services-telemetry";
import { setGlobalTimeoutContext } from "@fluidframework/server-services-client";
import { AsyncLocalStorageTelemetryContext, AsyncLocalStorageTimeoutContext } from "./asyncContext";

export function configureGlobalTelemetryContext() {
	const globalTelemetryContext = new AsyncLocalStorageTelemetryContext();
	setGlobalTelemetryContext(globalTelemetryContext);
}

export function configureGlobalTimeoutContext() {
	const globalTimeoutContext = new AsyncLocalStorageTimeoutContext();
	setGlobalTimeoutContext(globalTimeoutContext);
}

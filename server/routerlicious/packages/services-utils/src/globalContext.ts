/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { setGlobalTelemetryContext } from "@fluidframework/server-services-telemetry";
import { AsyncLocalStorageTelemetryContext } from "./asyncContext";

export function configureGlobalContext() {
	const globalTelemetryContext = new AsyncLocalStorageTelemetryContext();
	setGlobalTelemetryContext(globalTelemetryContext);
}

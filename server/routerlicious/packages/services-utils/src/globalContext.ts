/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	setGlobalAbortControllerContext,
	setGlobalTimeoutContext,
} from "@fluidframework/server-services-client";
import { setGlobalTelemetryContext } from "@fluidframework/server-services-telemetry";

import {
	AsyncLocalStorageAbortControllerContext,
	AsyncLocalStorageTelemetryContext,
	AsyncLocalStorageTimeoutContext,
} from "./asyncContext";

/**
 * @internal
 */
export function configureGlobalTelemetryContext(): void {
	const globalTelemetryContext = new AsyncLocalStorageTelemetryContext();
	setGlobalTelemetryContext(globalTelemetryContext);
}

/**
 * @internal
 */
export function configureGlobalTimeoutContext(): void {
	const globalTimeoutContext = new AsyncLocalStorageTimeoutContext();
	setGlobalTimeoutContext(globalTimeoutContext);
}

/**
 * @internal
 */
export function configureGlobalAbortControllerContext(): void {
	const globalAbortControllerContext = new AsyncLocalStorageAbortControllerContext();
	setGlobalAbortControllerContext(globalAbortControllerContext);
}

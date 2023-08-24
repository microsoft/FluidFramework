/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getGlobalTelemetryContext } from "@fluidframework/server-services-telemetry";
import { AsyncLocalStorageContextProvider } from "./asyncLocalStorage";

// TODO: Maybe all of this should happen in a `configureGlobalTelemetryContext()` helper
const globalAsyncLocalStorageContextProvider = new AsyncLocalStorageContextProvider();
global.asyncLocalStorageContextProvider = globalAsyncLocalStorageContextProvider;
const globalTelemetryContext = getGlobalTelemetryContext();
if (globalTelemetryContext) {
	globalTelemetryContext.telemetryContextPropertyProvider =
		globalAsyncLocalStorageContextProvider;
}

export {
	bindCorrelationId,
	getCorrelationId,
	getCorrelationIdWithHttpFallback,
} from "./asyncLocalStorage";
export {
	generateToken,
	generateUser,
	getCreationToken,
	getParam,
	respondWithNetworkError,
	validateTokenClaims,
	verifyStorageToken,
	validateTokenScopeClaims,
	verifyToken,
} from "./auth";
export { parseBoolean } from "./conversion";
export { deleteSummarizedOps } from "./deleteSummarizedOps";
export { getHostIp } from "./dns";
export { FluidServiceError, FluidServiceErrorCode } from "./errorUtils";
export { executeApiWithMetric } from "./executeApiWithMetric";
export { executeOnInterval, ScheduledJob } from "./executeOnInterval";
export { choose, getRandomName } from "./generateNames";
export { configureLogging, IWinstonConfig } from "./logger";
export {
	alternativeMorganLoggerMiddleware,
	jsonMorganLoggerMiddleware,
} from "./morganLoggerMiddleware";
export { normalizePort } from "./port";
export {
	executeRedisMultiWithHmsetExpire,
	executeRedisMultiWithHmsetExpireAndLpush,
	IRedisParameters,
} from "./redisUtils";
export { IThrottleConfig, ISimpleThrottleConfig, getThrottleConfig } from "./throttlerConfigs";
export { IThrottleMiddlewareOptions, throttle } from "./throttlerMiddleware";
export { WinstonLumberjackEngine } from "./winstonLumberjackEngine";
export {
	WebSocketTracker,
	DummyTokenRevocationManager,
	DummyRevokedTokenChecker,
} from "./tokenRevocationManager";
export { getBooleanFromConfig, getNumberFromConfig } from "./configUtils";
export { IApiCounters, InMemoryApiCounters } from "./apiCounters";

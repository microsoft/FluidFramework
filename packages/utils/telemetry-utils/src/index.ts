/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
export {
	createChildMonitoringContext,
	MonitoringContext,
	IConfigProviderBase,
	sessionStorageConfigProvider,
	mixinMonitoringContext,
	IConfigProvider,
	ConfigTypes,
	loggerToMonitoringContext,
} from "./config";
export {
	extractLogSafeErrorProperties,
	generateErrorWithStack,
	generateStack,
	getCircularReplacer,
	IFluidErrorAnnotations,
	isExternalError,
	isILoggingError,
	isTaggedTelemetryPropertyValue,
	LoggingError,
	normalizeError,
	wrapError,
	wrapErrorAndLog,
} from "./errorLogging";
export { EventEmitterWithErrorHandling } from "./eventEmitterWithErrorHandling";
export {
	connectedEventName,
	disconnectedEventName,
	raiseConnectedEvent,
	safeRaiseEvent,
} from "./events";
export {
	hasErrorInstanceId,
	// IFluidErrorBase,
	isFluidError,
	isValidLegacyError,
} from "./fluidErrorBase";
export {
	eventNamespaceSeparator,
	createChildLogger,
	createMultiSinkLogger,
	formatTick,
	IPerformanceEventMarkers,
	ITelemetryLoggerPropertyBag,
	ITelemetryLoggerPropertyBags,
	numberFromString,
	PerformanceEvent,
	TaggedLoggerAdapter,
	tagData,
	tagCodeArtifacts,
	TelemetryDataTag,
	TelemetryEventPropertyTypes,
} from "./logger";
export { MockLogger } from "./mockLogger";
export { ThresholdCounter } from "./thresholdCounter";
export { SampledTelemetryHelper } from "./sampledTelemetryHelper";
export { logIfFalse } from "./utils";
export { ITelemetryEventExt } from "./telemetryTypes";

// Deprecated exports

export {
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	IFluidErrorBase,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	TelemetryEventPropertyTypeExt,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	ITelemetryGenericEventExt,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	ITelemetryErrorEventExt,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	ITelemetryPerformanceEventExt,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	ITelemetryLoggerExt,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	ITaggedTelemetryPropertyTypeExt,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	ITelemetryPropertiesExt,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	NORMALIZED_ERROR_TYPE,
} from "@fluidframework/core-interfaces";

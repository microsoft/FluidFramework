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
export { EventEmitterWithErrorHandling } from "./eventEmitterWithErrorHandling";
export {
	connectedEventName,
	disconnectedEventName,
	raiseConnectedEvent,
	safeRaiseEvent,
} from "./events";
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
	TelemetryNullLogger,
} from "./logger";
export { MockLogger } from "./mockLogger";
export { ThresholdCounter } from "./thresholdCounter";
export { SampledTelemetryHelper } from "./sampledTelemetryHelper";
export { logIfFalse } from "./utils";
export { ITelemetryEventExt } from "./telemetryTypes";

// Deprecated exports (moved to core-interfaces).
// Kept here to preserve compatibility. They will be removed in a subsequent release.

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
	hasErrorInstanceId,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	isFluidError,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	isValidLegacyError,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	extractLogSafeErrorProperties,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	generateErrorWithStack,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	generateStack,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	getCircularReplacer,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	IFluidErrorAnnotations,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	isExternalError,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	isILoggingError,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	isTaggedTelemetryPropertyValue,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	LoggingError,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	NORMALIZED_ERROR_TYPE,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	normalizeError,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	wrapError,
	/**
	 * @deprecated Import from "\@fluidframework/core-interfaces" instead.
	 */
	wrapErrorAndLog,
} from "@fluidframework/core-interfaces";

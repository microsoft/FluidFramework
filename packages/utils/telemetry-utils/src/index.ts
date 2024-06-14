/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type { MonitoringContext, IConfigProvider } from "./config.js";
export {
	createChildMonitoringContext,
	sessionStorageConfigProvider,
	mixinMonitoringContext,
	loggerToMonitoringContext,
	wrapConfigProviderWithDefaults,
} from "./config.js";
export {
	DataCorruptionError,
	DataProcessingError,
	extractSafePropertiesFromMessage,
	GenericError,
	UsageError,
	validatePrecondition,
} from "./error.js";
export type { IFluidErrorAnnotations } from "./errorLogging.js";
export {
	extractLogSafeErrorProperties,
	generateErrorWithStack,
	generateStack,
	getCircularReplacer,
	isExternalError,
	isILoggingError,
	isTaggedTelemetryPropertyValue,
	LoggingError,
	NORMALIZED_ERROR_TYPE,
	normalizeError,
	overwriteStack,
	wrapError,
	wrapErrorAndLog,
} from "./errorLogging.js";
export { EventEmitterWithErrorHandling } from "./eventEmitterWithErrorHandling.js";
export {
	connectedEventName,
	disconnectedEventName,
	raiseConnectedEvent,
	safeRaiseEvent,
} from "./events.js";
export type { IFluidErrorBase } from "./fluidErrorBase.js";
export { hasErrorInstanceId, isFluidError } from "./fluidErrorBase.js";
export type {
	IPerformanceEventMarkers,
	ITelemetryLoggerPropertyBag,
	ITelemetryLoggerPropertyBags,
	MultiSinkLoggerProperties,
	TelemetryEventPropertyTypes,
} from "./logger.js";
export {
	eventNamespaceSeparator,
	createChildLogger,
	createMultiSinkLogger,
	formatTick,
	numberFromString,
	PerformanceEvent,
	TaggedLoggerAdapter,
	tagData,
	tagCodeArtifacts,
	TelemetryDataTag,
} from "./logger.js";
export { MockLogger } from "./mockLogger.js";
export { ThresholdCounter } from "./thresholdCounter.js";
export { SampledTelemetryHelper } from "./sampledTelemetryHelper.js";
export type { IEventSampler, ISampledTelemetryLogger } from "./utils.js";
export { createSampledLogger } from "./utils.js";
export type {
	TelemetryEventPropertyTypeExt,
	ITelemetryEventExt,
	ITelemetryGenericEventExt,
	ITelemetryErrorEventExt,
	ITelemetryPerformanceEventExt,
	ITelemetryLoggerExt,
	ITaggedTelemetryPropertyTypeExt,
	ITelemetryPropertiesExt,
	TelemetryEventCategory,
} from "./telemetryTypes.js";
export { type IMeasuredCodeResult, TelemetryEventBatcher } from "./telemetryEventBatcher.js";

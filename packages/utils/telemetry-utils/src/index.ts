/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	createChildMonitoringContext,
	type MonitoringContext,
	sessionStorageConfigProvider,
	mixinMonitoringContext,
	type IConfigProvider,
	loggerToMonitoringContext,
	wrapConfigProviderWithDefaults,
	createConfigBasedOptionsProxy,
	type OptionConfigReaders,
} from "./config.js";
export {
	DataCorruptionError,
	DataProcessingError,
	extractSafePropertiesFromMessage,
	GenericError,
	UsageError,
	validatePrecondition,
} from "./error.js";
export {
	extractLogSafeErrorProperties,
	generateErrorWithStack,
	generateStack,
	getCircularReplacer,
	type IFluidErrorAnnotations,
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
export { hasErrorInstanceId, type IFluidErrorBase, isFluidError } from "./fluidErrorBase.js";
export {
	eventNamespaceSeparator,
	createChildLogger,
	createMultiSinkLogger,
	formatTick,
	type IPerformanceEventMarkers,
	type ITelemetryLoggerPropertyBag,
	type ITelemetryLoggerPropertyBags,
	type MultiSinkLoggerProperties,
	numberFromString,
	PerformanceEvent,
	TaggedLoggerAdapter,
	tagData,
	tagCodeArtifacts,
	TelemetryDataTag,
	type TelemetryEventPropertyTypes,
} from "./logger.js";
export {
	createMockLoggerExt,
	type IMockLoggerExt,
	MockLogger,
} from "./mockLogger.js";
export { ThresholdCounter } from "./thresholdCounter.js";
export {
	SampledTelemetryHelper,
	type CustomMetrics,
	type ICustomData,
	type MeasureReturnType,
} from "./sampledTelemetryHelper.js";
export {
	createSampledLogger,
	type IEventSampler,
	type ISampledTelemetryLogger,
	measure,
} from "./utils.js";
export type {
	TelemetryEventPropertyTypeExt,
	ITelemetryEventExt,
	ITelemetryGenericEventExt,
	ITelemetryErrorEventExt,
	ITelemetryPerformanceEventExt,
	ITelemetryLoggerExt,
	ITelemetryPropertiesExt,
	TelemetryEventCategory,
} from "./telemetryTypes.js";
export { TelemetryEventBatcher } from "./telemetryEventBatcher.js";

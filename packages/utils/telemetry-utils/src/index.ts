/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type IConfigProvider,
	type MonitoringContext,
	type OptionConfigReaders,
	createChildMonitoringContext,
	createConfigBasedOptionsProxy,
	loggerToMonitoringContext,
	mixinMonitoringContext,
	sessionStorageConfigProvider,
	wrapConfigProviderWithDefaults,
} from "./config.js";
export {
	DataCorruptionError,
	DataProcessingError,
	GenericError,
	LayerIncompatibilityError,
	type MessageLike,
	UsageError,
	extractSafePropertiesFromMessage,
	validatePrecondition,
} from "./error.js";
export {
	type IFluidErrorAnnotations,
	LoggingError,
	NORMALIZED_ERROR_TYPE,
	extractLogSafeErrorProperties,
	generateErrorWithStack,
	generateStack,
	getCircularReplacer,
	isExternalError,
	isILoggingError,
	isTaggedTelemetryPropertyValue,
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
export {
	type IFluidErrorBase,
	hasErrorInstanceId,
	isFluidError,
	isLayerIncompatibilityError,
} from "./fluidErrorBase.js";
export { allowIncompatibleLayersKey, validateLayerCompatibility } from "./layerCompatError.js";
export {
	type IPerformanceEventMarkers,
	type ITelemetryLoggerPropertyBag,
	type ITelemetryLoggerPropertyBags,
	type MultiSinkLoggerProperties,
	PerformanceEvent,
	TaggedLoggerAdapter,
	TelemetryDataTag,
	type TelemetryEventPropertyTypes,
	createChildLogger,
	createMultiSinkLogger,
	eventNamespaceSeparator,
	formatTick,
	numberFromString,
	tagCodeArtifacts,
	tagData,
} from "./logger.js";
export {
	type IMockLoggerExt,
	MockLogger,
	createMockLoggerExt,
} from "./mockLogger.js";
export {
	type CustomMetrics,
	type ICustomData,
	type MeasureReturnType,
	SampledTelemetryHelper,
} from "./sampledTelemetryHelper.js";
export { TelemetryEventBatcher } from "./telemetryEventBatcher.js";
export type {
	ITelemetryErrorEventExt,
	ITelemetryEventExt,
	ITelemetryGenericEventExt,
	ITelemetryLoggerExt,
	ITelemetryPerformanceEventExt,
	ITelemetryPropertiesExt,
	TelemetryEventCategory,
	TelemetryEventPropertyTypeExt,
} from "./telemetryTypes.js";
export { ThresholdCounter } from "./thresholdCounter.js";
export {
	type IEventSampler,
	type ISampledTelemetryLogger,
	createSampledLogger,
	measure,
} from "./utils.js";

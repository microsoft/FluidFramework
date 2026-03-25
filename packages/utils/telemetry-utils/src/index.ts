/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	createChildMonitoringContext,
	createConfigBasedOptionsProxy,
	type IConfigProvider,
	loggerToMonitoringContext,
	type MonitoringContext,
	mixinMonitoringContext,
	type OptionConfigReaders,
	sessionStorageConfigProvider,
	wrapConfigProviderWithDefaults,
} from "./config.js";
export {
	DataCorruptionError,
	DataProcessingError,
	extractSafePropertiesFromMessage,
	GenericError,
	LayerIncompatibilityError,
	type MessageLike,
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
export {
	hasErrorInstanceId,
	type IFluidErrorBase,
	isFluidError,
	isLayerIncompatibilityError,
} from "./fluidErrorBase.js";
export { allowIncompatibleLayersKey, validateLayerCompatibility } from "./layerCompatError.js";
export {
	createChildLogger,
	createMultiSinkLogger,
	eventNamespaceSeparator,
	formatTick,
	type IPerformanceEventMarkers,
	type ITelemetryLoggerPropertyBag,
	type ITelemetryLoggerPropertyBags,
	type MultiSinkLoggerProperties,
	numberFromString,
	PerformanceEvent,
	TaggedLoggerAdapter,
	TelemetryDataTag,
	type TelemetryEventPropertyTypes,
	tagCodeArtifacts,
	tagData,
} from "./logger.js";
export {
	createMockLoggerExt,
	type IMockLoggerExt,
	MockLogger,
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
	createSampledLogger,
	type IEventSampler,
	type ISampledTelemetryLogger,
	measure,
} from "./utils.js";

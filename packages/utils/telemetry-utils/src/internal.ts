/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// The "internal" exports are a superset of the standard ones. So, we want to export everything from the standard barrel file.
// eslint-disable-next-line no-restricted-syntax
export * from "./main.js";

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
	LayerIncompatibilityError,
	type MessageLike,
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
export {
	eventNamespaceSeparator,
	createChildLogger,
	createMultiSinkLogger,
	extractTelemetryLoggerExt,
	formatTick,
	type IPerformanceEventMarkers,
	type MultiSinkLoggerProperties,
	numberFromString,
	PerformanceEvent,
	TaggedLoggerAdapter,
	tagData,
	tagCodeArtifacts,
	TelemetryDataTag,
	toITelemetryLoggerExt,
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
	ITelemetryEventExt,
	TelemetryLoggerExt,
} from "./telemetryTypes.js";
export type {
	ITelemetryGenericEventExt,
	ITelemetryErrorEventExt,
	ITelemetryPerformanceEventExt,
	TelemetryEventCategory,
} from "./telemetryTypesUndeprecated.js";
export { TelemetryEventBatcher } from "./telemetryEventBatcher.js";
export { allowIncompatibleLayersKey, validateLayerCompatibility } from "./layerCompatError.js";

import type { TelemetryLoggerExt } from "./telemetryTypes.js";

/**
 * Renamed version of TelemetryLoggerExt for convenience of internal use.
 * Where "`ITelemetryLoggerExt`" is exposed in customer API surface, true
 * `ITelemetryLoggerExt` (that is an erased type) must be used. To access
 * use `@fluidframework/telemetry-utils/legacy` import spec. All internal
 * usages should be promoted to `TelemetryLoggerExt` naming.
 *
 * @internal
 */
export type ITelemetryLoggerExt = TelemetryLoggerExt;

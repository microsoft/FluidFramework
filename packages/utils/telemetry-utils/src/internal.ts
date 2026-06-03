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
	extractTelemetryLoggerExt,
	formatTick,
	type IPerformanceEventMarkers,
	type MultiSinkLoggerProperties,
	numberFromString,
	PerformanceEvent,
	TaggedLoggerAdapter,
	TelemetryDataTag,
	tagCodeArtifacts,
	tagData,
	toITelemetryLoggerExt,
} from "./logger.js";
// The "internal" exports are a superset of the standard ones. So, we want to export everything from the standard barrel file.
// eslint-disable-next-line no-restricted-syntax
export * from "./main.js";
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
	ITelemetryEventExt,
	TelemetryLoggerExt,
} from "./telemetryTypes.js";
export type {
	ITelemetryErrorEventExt,
	ITelemetryGenericEventExt,
	ITelemetryPerformanceEventExt,
	TelemetryEventCategory,
} from "./telemetryTypesUndeprecated.js";
export { ThresholdCounter } from "./thresholdCounter.js";
export {
	createSampledLogger,
	type IEventSampler,
	type ISampledTelemetryLogger,
	measure,
} from "./utils.js";

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

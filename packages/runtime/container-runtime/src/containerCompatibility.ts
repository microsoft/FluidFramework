/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FlushMode,
	type MinimumVersionForCollab,
} from "@fluidframework/runtime-definitions/internal";
import {
	configValueToMinVersionForCollab,
	getConfigsForMinVersionForCollab,
	getValidationForRuntimeOptions,
	type ConfigMap,
	type ConfigValidationMap,
} from "@fluidframework/runtime-utils/internal";

import {
	disabledCompressionConfig,
	enabledCompressionConfig,
} from "./compressionDefinitions.js";
import type { ContainerRuntimeOptionsInternal } from "./containerRuntime.js";

/**
 * Subset of the {@link ContainerRuntimeOptionsInternal} properties which
 * affect {@link IDocumentSchemaFeatures}.
 *
 * @remarks
 * When a new option is added to {@link ContainerRuntimeOptionsInternal}, we
 * must consider if it changes the DocumentSchema. If so, then a corresponding
 * entry must be added to {@link runtimeOptionsAffectingDocSchemaConfigMap}
 * below. If not, then it must be omitted from this type.
 *
 * Note: `Omit` is used instead of `Pick` to ensure that all new options are
 * included in this type by default. If any new properties are added to
 * {@link ContainerRuntimeOptionsInternal}, they will be included in this
 * type unless explicitly omitted. This will prevent us from forgetting to
 * account for any new properties in the future.
 */
export type RuntimeOptionsAffectingDocSchema = Omit<
	ContainerRuntimeOptionsInternal,
	| "chunkSizeInBytes"
	| "maxBatchSizeInBytes"
	| "loadSequenceNumberVerification"
	| "summaryOptions"
	| "allowDetachedResolve"
>;

/**
 * Mapping of RuntimeOptionsAffectingDocSchema to their compatibility related configs.
 *
 * Each key in this map corresponds to a property in RuntimeOptionsAffectingDocSchema. The value is an object that maps MinimumVersionForCollab
 * to the appropriate default value for that property to supporting that MinimumVersionForCollab. If clients running MinimumVersionForCollab X are able to understand
 * the format changes introduced by the property, then the default value for that MinimumVersionForCollab will enable the feature associated with the property.
 * Otherwise, the feature will be disabled.
 *
 * For example if the minVersionForCollab is a 1.x version (i.e. "1.5.0"), then the default value for `enableGroupedBatching` will be false since 1.x
 * clients do not understand the document format when batching is enabled. If the minVersionForCollab is a 2.x client (i.e. "2.0.0" or later), then the
 * default value for `enableGroupedBatching` will be true because clients running 2.0 or later will be able to understand the format changes associated
 * with the batching feature.
 */
const runtimeOptionsAffectingDocSchemaConfigMap = {
	enableGroupedBatching: {
		"1.0.0": false,
		"2.0.0-defaults": true,
	},
	compressionOptions: {
		"1.0.0": disabledCompressionConfig,
		"2.0.0-defaults": enabledCompressionConfig,
	},
	enableRuntimeIdCompressor: {
		// For IdCompressorMode, `undefined` represents a logical state (off).
		// However, to satisfy the Required<> constraint while
		// `exactOptionalPropertyTypes` is `false` (TODO: AB#8215), we need
		// to have it defined, so we trick the type checker here.
		"1.0.0": undefined,
		// We do not yet want to enable idCompressor by default since it will
		// increase bundle sizes, and not all customers will benefit from it.
		// Therefore, we will require customers to explicitly enable it. We
		// are keeping it as a DocSchema affecting option for now as this may
		// change in the future.
	},
	explicitSchemaControl: {
		"1.0.0": false,
		// This option's intention is to prevent 1.x clients from joining sessions
		// when enabled. This is set to true when the minVersionForCollab is set
		// to >=2.0.0 (explicitly). This is different than other 2.0 defaults
		// because it was not enabled by default prior to the implementation of
		// `minVersionForCollab`.
		// `defaultMinVersionForCollab` is set to "2.0.0-defaults" which "2.0.0"
		// does not satisfy to avoiding enabling this option by default as of
		// `minVersionForCollab` introduction, which could be unexpected.
		// Only enable as a default when `minVersionForCollab` is specified at
		// 2.0.0+.
		"2.0.0": true,
	},
	flushMode: {
		// Note: 1.x clients are compatible with TurnBased flushing, but here we elect to remain on Immediate flush mode
		// as a work-around for inability to send batches larger than 1Mb. Immediate flushing keeps batches smaller as
		// fewer messages will be included per flush.
		"1.0.0": FlushMode.Immediate,
		"2.0.0-defaults": FlushMode.TurnBased,
	},
	gcOptions: {
		"1.0.0": {},
		// Although sweep is supported in 2.x, it is disabled by default until minVersionForCollab>=3.0.0 to be extra safe.
		"3.0.0": { enableGCSweep: true },
	},
	createBlobPayloadPending: {
		// This feature is new and disabled by default. In the future we will enable it by default, but we have not
		// closed on the version where that will happen yet.  Probably a .10 release since blob functionality is not
		// exposed on the `@public` API surface.
		"1.0.0": undefined,
	},
} as const satisfies ConfigMap<RuntimeOptionsAffectingDocSchema>;

const runtimeOptionsAffectingDocSchemaConfigValidationMap = {
	enableGroupedBatching: configValueToMinVersionForCollab([
		[false, "1.0.0"],
		[true, "2.0.0-defaults"],
	]),
	compressionOptions: configValueToMinVersionForCollab([
		[{ ...disabledCompressionConfig }, "1.0.0"],
		[{ ...enabledCompressionConfig }, "2.0.0-defaults"],
	]),
	enableRuntimeIdCompressor: configValueToMinVersionForCollab([
		[undefined, "1.0.0"],
		["on", "2.0.0-defaults"],
		["delayed", "2.0.0-defaults"],
	]),
	explicitSchemaControl: configValueToMinVersionForCollab([
		[false, "1.0.0"],
		[true, "2.0.0-defaults"],
	]),
	flushMode: configValueToMinVersionForCollab([
		[FlushMode.Immediate, "1.0.0"],
		[FlushMode.TurnBased, "2.0.0-defaults"],
	]),
	gcOptions: configValueToMinVersionForCollab([
		[{ enableGCSweep: undefined }, "1.0.0"],
		[{ enableGCSweep: true }, "2.0.0-defaults"],
	]),
	createBlobPayloadPending: configValueToMinVersionForCollab([
		[undefined, "1.0.0"],
		[true, "2.40.0"],
	]),
} as const satisfies ConfigValidationMap<RuntimeOptionsAffectingDocSchema>;

/**
 * Returns the default RuntimeOptionsAffectingDocSchema configuration for a given minVersionForCollab.
 */
export function getMinVersionForCollabDefaults(
	minVersionForCollab: MinimumVersionForCollab,
): RuntimeOptionsAffectingDocSchema {
	return getConfigsForMinVersionForCollab(
		minVersionForCollab,
		runtimeOptionsAffectingDocSchemaConfigMap,
		// This is a bad cast away from Partial that getConfigsForCompatMode provides.
		// ConfigMap should be restructured to provide RuntimeOptionsAffectingDocSchema guarantee.
	) as RuntimeOptionsAffectingDocSchema;
}

/**
 * Validates if the runtime options passed in from the user are compatible with the minVersionForCollab.
 * For example, if a user sets the `enableGroupedBatching` option to true, but the minVersionForCollab
 * is set to "1.0.0", then we should throw a UsageError since 1.x clients do not support batching.
 * */
export function validateRuntimeOptions(
	minVersionForCollab: MinimumVersionForCollab,
	runtimeOptions: Partial<ContainerRuntimeOptionsInternal>,
): void {
	getValidationForRuntimeOptions<RuntimeOptionsAffectingDocSchema>(
		minVersionForCollab,
		runtimeOptions as Partial<RuntimeOptionsAffectingDocSchema>,
		runtimeOptionsAffectingDocSchemaConfigValidationMap,
	);
}

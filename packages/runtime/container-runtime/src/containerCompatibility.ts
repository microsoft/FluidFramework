/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FlushMode,
	type OldestSupportedClientVersion,
} from "@fluidframework/runtime-definitions/internal";
import {
	configValueToMinVersionForCollab,
	getConfigsForMinVersionForCollab,
	validateConfigMapOverrides,
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
	| "stagingModeAutoFlushThreshold"
	| "disableSchemaUpgrade"
>;

/**
 * Subset of {@link RuntimeOptionsAffectingDocSchema} which existed prior to the introduction of explicitSchemaControl.
 *
 * @remarks
 * Runtime options that affect document schema should generally require explicitSchemaControl to be enabled.
 * However, to prevent disruption to existing customers, options that existed prior to explicitSchemaControl
 * do not explicity require explicitSchemaControl to be enabled. Do not add new options to this list.
 */
type RuntimeOptionKeysPredatingExplicitSchemaControl = keyof Pick<
	RuntimeOptionsAffectingDocSchema,
	| "explicitSchemaControl"
	| "compressionOptions"
	| "enableRuntimeIdCompressor"
	| "flushMode"
	| "gcOptions"
	| "enableGroupedBatching"
>;

/**
 * List of keys of {@link RuntimeOptionsAffectingDocSchema} which existed prior to the introduction of explicitSchemaControl.
 *
 * @remarks
 * Runtime options that affect document schema should generally require explicitSchemaControl to be enabled.
 * However, to prevent disruption to existing customers, options that existed prior to explicitSchemaControl
 * do not explicity require explicitSchemaControl to be enabled. Do not add new keys to this list.
 */
const keysOfOptionsPredatingExplicitSchemaControl = new Set([
	"explicitSchemaControl",
	"compressionOptions",
	"enableRuntimeIdCompressor",
	"flushMode",
	"gcOptions",
	"enableGroupedBatching",
]) satisfies Set<RuntimeOptionKeysPredatingExplicitSchemaControl>;

/**
 * Subset of {@link RuntimeOptionsAffectingDocSchema} which require explicitSchemaControl to be enabled.
 */
export type RuntimeOptionKeysThatRequireExplicitSchemaControl = keyof Omit<
	RuntimeOptionsAffectingDocSchema,
	RuntimeOptionKeysPredatingExplicitSchemaControl
>;

/**
 * Mapping of RuntimeOptionsAffectingDocSchema to their compatibility related configs.
 *
 * Each key in this map corresponds to a property in RuntimeOptionsAffectingDocSchema. The value is an object that maps OldestSupportedClientVersion
 * to the appropriate default value for that property to supporting that OldestSupportedClientVersion. If clients running OldestSupportedClientVersion X are able to understand
 * the format changes introduced by the property, then the default value for that OldestSupportedClientVersion will enable the feature associated with the property.
 * Otherwise, the feature will be disabled.
 *
 * For example, the default value for `enableGroupedBatching` is true at the supported
 * floor of 2.0.0 because clients running 2.0.0 or later understand the associated
 * document format.
 */
const runtimeOptionsAffectingDocSchemaConfigMap: ConfigMap<RuntimeOptionsAffectingDocSchema> =
	{
		enableGroupedBatching: {
			// Grouped batching was already enabled by default before callers explicitly selected
			// a compatibility version. All supported 2.x clients understand this format.
			"2.0.0": true,
		},
		compressionOptions: {
			// Compression was already enabled by default before callers explicitly selected a
			// compatibility version. All supported 2.x clients understand this format.
			"2.0.0": enabledCompressionConfig,
		},
		enableRuntimeIdCompressor: {
			// For IdCompressorMode, `undefined` represents a logical state (off).
			// However, to satisfy the Required<> constraint while
			// `exactOptionalPropertyTypes` is `false` (TODO: AB#8215), we need
			// to have it defined, so we trick the type checker here.
			"2.0.0": undefined,
			// We do not yet want to enable idCompressor by default since it will
			// increase bundle sizes, and not all customers will benefit from it.
			// Therefore, we will require customers to explicitly enable it. We
			// are keeping it as a DocSchema affecting option for now as this may
			// change in the future.
		},
		explicitSchemaControl: {
			// This option's intention is to prevent 1.x clients from joining sessions
			// when enabled. Before Client 3.0, this became true only when callers explicitly
			// selected 2.0.0 or later. Client 3.0 also uses 2.0.0 when the setting is omitted.
			"2.0.0": true,
		},
		flushMode: {
			// TurnBased flushing was already the default before callers explicitly selected a
			// compatibility version.
			"2.0.0": FlushMode.TurnBased,
		},
		gcOptions: {
			"2.0.0": {},
			// Although sweep is supported in 2.x, it is disabled by default until minVersionForCollab>=3.0.0 to be extra safe.
			// Note that enabling this is a significant change, that should likely be announced in the relevant version:
			// It would be bad if this simple caused the enablement when when the current package version passed this point without anyone being aware.
			// This is configuration targeting a future versions, which is not supported.
			// TODO: when preparing 3.0 (or at some later point), consider enabling this by default for clients 3.0 or newer
			// (and add user facing documentation indicating this is enabled by that version).
			// "3.0.0": { enableGCSweep: true },
		},
		createBlobPayloadPending: {
			// This feature is new and disabled by default. In the future we will enable it by default, but we have not
			// closed on the version where that will happen yet.  Probably a .10 release since blob functionality is not
			// exposed on the `@public` API surface.
			"2.0.0": undefined,
		},
	};

/**
 * Keys of {@link ContainerRuntimeOptionsInternal} that require explicitSchemaControl to be enabled.
 */
export const runtimeOptionKeysThatRequireExplicitSchemaControl = (
	Object.keys(
		runtimeOptionsAffectingDocSchemaConfigMap,
	) as (keyof RuntimeOptionsAffectingDocSchema)[]
).filter((key) => {
	return !keysOfOptionsPredatingExplicitSchemaControl.has(
		key as RuntimeOptionKeysPredatingExplicitSchemaControl,
	);
}) as RuntimeOptionKeysThatRequireExplicitSchemaControl[];

// A lot of the information in this seems redundant with whats defined above. Might be nice to combine them somehow.
const runtimeOptionsAffectingDocSchemaConfigValidationMap: ConfigValidationMap<RuntimeOptionsAffectingDocSchema> =
	{
		enableGroupedBatching: configValueToMinVersionForCollab([
			[false, "2.0.0"],
			[true, "2.0.0"],
		]),
		compressionOptions: configValueToMinVersionForCollab([
			[{ ...disabledCompressionConfig }, "2.0.0"],
			[{ ...enabledCompressionConfig }, "2.0.0"],
		]),
		enableRuntimeIdCompressor: configValueToMinVersionForCollab([
			[undefined, "2.0.0"],
			["on", "2.0.0"],
			["delayed", "2.0.0"],
		]),
		explicitSchemaControl: configValueToMinVersionForCollab([
			[false, "2.0.0"],
			[true, "2.0.0"],
		]),
		flushMode: configValueToMinVersionForCollab([
			[FlushMode.Immediate, "2.0.0"],
			[FlushMode.TurnBased, "2.0.0"],
		]),
		gcOptions: configValueToMinVersionForCollab([
			[{ enableGCSweep: undefined }, "2.0.0"],
			[{ enableGCSweep: true }, "2.0.0"],
		]),
		createBlobPayloadPending: configValueToMinVersionForCollab([
			[undefined, "2.0.0"],
			[true, "2.40.0"],
		]),
	};

/**
 * Returns the default RuntimeOptionsAffectingDocSchema configuration for a given minVersionForCollab.
 */
export function getMinVersionForCollabDefaults(
	minVersionForCollab: OldestSupportedClientVersion,
): RuntimeOptionsAffectingDocSchema {
	return getConfigsForMinVersionForCollab(
		minVersionForCollab,
		runtimeOptionsAffectingDocSchemaConfigMap,
	);
}

/**
 * Validates if the runtime options passed in from the user are compatible with the minVersionForCollab.
 * For example, if a user enables an option introduced in 2.40.0 while the
 * minVersionForCollab is set to "2.0.0", then we should throw a UsageError.
 * */
export function validateRuntimeOptions(
	minVersionForCollab: OldestSupportedClientVersion,
	runtimeOptions: Partial<ContainerRuntimeOptionsInternal>,
): void {
	validateConfigMapOverrides<RuntimeOptionsAffectingDocSchema>(
		minVersionForCollab,
		runtimeOptions,
		runtimeOptionsAffectingDocSchemaConfigValidationMap,
	);
}

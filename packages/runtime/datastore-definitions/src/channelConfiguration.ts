/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	JsonDeserialized,
	JsonSerializable,
	ReadonlyJsonTypeWith,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

import type { IChannelAttributes } from "./storage.js";

/**
 * Immutable JSON settings shared by all clients of one channel instance.
 * The channel implementation owns the schema and meaning of these values.
 * Runtime code treats their contents as opaque.
 * @internal
 */
export type ChannelConfiguration = Readonly<Record<string, ReadonlyJsonTypeWith<never>>>;

/**
 * Persisted configuration for a channel at a specific point in its history.
 * @internal
 */
export interface ChannelConfigurationSnapshotV1<
	TConfig extends object = ChannelConfiguration,
> {
	/**
	 * Version of this configuration snapshot format.
	 * Should be incremented if this format needs to be changed.
	 */
	readonly version: 1;
	/**
	 * Revision of this configuration. This gets incremented with each accepted configuration update.
	 */
	readonly revision: number;
	/**
	 * The channel-defined configuration values for this snapshot.
	 * The channel implementation is responsible for validating their contents.
	 * Because these values are persistent, the DDS author is responsible for maintaining
	 * compatibility with values written by supported older versions.
	 */
	readonly values: JsonSerializable<TConfig> & JsonDeserialized<TConfig>;
}

/**
 * Attributes for an instance using the configuration protocol.
 *
 * The DDS owns the configuration values.
 * They are stored with the channel attributes so the runtime can validate the generic persisted
 * format and make the values available to the channel factory before constructing the channel
 * or processing buffered operations.
 *
 * @remarks
 * The runtime validates the generic persisted format before loading the channel, but it does not
 * verify that the loaded channel preserves the configuration.
 * The DDS author must validate, respect, and preserve the configuration.
 * For compatibility reasons, channels generally avoid writing an explicit configuration until
 * after the first configuration change has been requested.
 *
 * A configuration-backed feature that changes persisted data must follow the cross-client
 * compatibility staging process in `CrossClientCompatibilityDevGuide.md`.
 * In particular, the adopting feature must be controlled by a container runtime option represented
 * in the document schema, configured in both compatibility maps, and covered by `FullCompat` tests.
 * The runtime option may be enabled only when `oldestSupportedClient` permits the version that reads
 * and preserves the configuration; raising that floor without document-schema enforcement is not
 * sufficient.
 *
 * Enabling the feature before saturation can allow an older summarizer to discard configuration
 * that it does not understand.
 * @internal
 */
export interface ConfiguredChannelAttributes extends IChannelAttributes {
	readonly configuration: ChannelConfigurationSnapshotV1;
}

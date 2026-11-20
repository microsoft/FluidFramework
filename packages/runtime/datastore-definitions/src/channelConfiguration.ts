/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ReadonlyJsonTypeWith } from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

import type { IChannelAttributes } from "./storage.js";

/**
 * Immutable JSON settings shared by all clients of one channel instance.
 * The channel author defines the keys and their meaning; different instances can have different settings.
 * @internal
 */
export type ChannelConfiguration = Readonly<Record<string, ReadonlyJsonTypeWith<never>>>;

/**
 * Persisted configuration for a channel at a specific point in its history.
 * @internal
 */
export interface ChannelConfigurationSnapshotV1<
	TConfig extends ChannelConfiguration = ChannelConfiguration,
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
	 */
	readonly values: TConfig;
}

/**
 * Attributes for an instance using the configuration protocol.
 * The configuration is stored with these attributes so a reader can select the protocol and
 * initialize the channel's settings before it loads channel data or processes buffered ops.
 * @internal
 */
export interface ConfiguredChannelAttributes extends IChannelAttributes {
	readonly configuration: ChannelConfigurationSnapshotV1;
}

/**
 * Declares configuration protocol support for a channel or its factory.
 *
 * This does not mean the channel's attributes will necessarily contain a configuration.
 * Just that if the attributes already contain a configuration, the channel will respect and preserve it.
 * For compatibility reasons (see remarks), channels generally avoid writing an explicit configuration
 * until after the first configuration change has been requested.
 *
 * @remarks Channels that use configuration should implement this interface to declare their support.
 * This is used as a safety guard to avoid compatibility issues between code support for configuration
 * and presence of configuration in the attributes blob.
 *
 * e.g. shortly after a channel opts into using configuration, a new version of the code writes a document
 * containing configured attributes. If an older version (code-wise) of that channel is allowed to load the
 * document and is elected summarizer, it would drop the configuration changes made by the new version.
 *
 * Document load paths have consistency checks using this interface to prevent such incompatible scenarios
 * (by failing fast on the old client when it attempts to load the document produced by the new code).
 *
 * Since the safeguards cause immediate failure, general practices around saturating support for configured DDSes
 * before using that configuration capability must be followed for application ecosystems that care.
 * @internal
 */
export interface ChannelConfigurationSupport {
	readonly channelConfigurationProtocolVersion?: 1;
}

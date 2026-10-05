/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ReadonlyJsonTypeWith } from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

import type { IChannelAttributes } from "./storage.js";

export type { ChannelConfigurationRuntime } from "@fluidframework/runtime-definitions/internal";

/**
 * Immutable JSON settings shared by all clients of one channel instance.
 * The channel author defines the keys and their meaning; different instances can have different settings.
 * @internal
 */
export type ChannelConfiguration = Readonly<Record<string, ReadonlyJsonTypeWith<never>>>;

/**
 * Persisted configuration for a channel at a specific point in its history.
 * The format version describes the encoding; the revision counts accepted replacements.
 * @internal
 */
export interface ChannelConfigurationSnapshot<
	TConfig extends ChannelConfiguration = ChannelConfiguration,
> {
	readonly version: 1;
	readonly revision: number;
	readonly values: TConfig;
}

/**
 * Attributes for an instance using the configuration protocol.
 * The configuration is stored with these attributes so a reader can select the protocol and
 * initialize the channel's settings before it loads channel data or processes buffered ops.
 * @internal
 */
export interface ConfiguredChannelAttributes extends IChannelAttributes {
	readonly configuration: ChannelConfigurationSnapshot;
}

/**
 * Declares that a factory can read the configuration protocol.
 * Reader support is separate from enabling configuration on new instances. A channel whose
 * attributes have no configuration continues to use the existing protocol.
 * @internal
 */
export interface ChannelConfigurationFactory {
	readonly channelConfigurationProtocolVersion?: 1;
}

/**
 * Declares that a channel instance has initialized the configuration protocol.
 * The runtime checks this before connecting the channel or replaying ops, so a reader cannot
 * silently load a configured instance without its configuration controller.
 * @internal
 */
export interface ChannelConfigurationChannel extends ChannelConfigurationFactory {}

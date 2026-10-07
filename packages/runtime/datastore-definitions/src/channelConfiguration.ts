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
 * The format version describes the encoding; the revision counts accepted replacements.
 * @internal
 */
export interface ChannelConfigurationSnapshotV1<
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
	readonly configuration: ChannelConfigurationSnapshotV1;
}

/**
 * Declares configuration protocol support for a channel or its factory.
 * Reader support is separate from per-instance activation. A supporting factory uses its
 * default configuration for unmarked channels and can process their first configuration op.
 * A factory's attributes must not contain per-instance configuration.
 *
 * On a channel instance, this declares that it has initialized the configuration protocol.
 * The runtime checks this before connecting the channel or replaying ops, so a reader cannot
 * silently load a configured instance without its configuration controller.
 * @internal
 */
export interface ChannelConfigurationSupport {
	readonly channelConfigurationProtocolVersion?: 1;
}

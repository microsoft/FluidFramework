/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ReadonlyJsonTypeWith } from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

import type { IChannelAttributes } from "./storage.js";

export type { ChannelConfigurationRuntime } from "@fluidframework/runtime-definitions/internal";

/**
 * Immutable JSON values for one channel's configuration.
 * @internal
 */
export type ChannelConfiguration = Readonly<Record<string, ReadonlyJsonTypeWith<never>>>;

/**
 * Version 1 of the persisted channel configuration format.
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
 * @internal
 */
export interface ConfiguredChannelAttributes extends IChannelAttributes {
	readonly configuration: ChannelConfigurationSnapshot;
}

/**
 * Optional factory capability. Reader support does not opt legacy instances in.
 * @internal
 */
export interface ChannelConfigurationFactory {
	readonly channelConfigurationProtocolVersion?: 1;
}

/**
 * A configured instance registers its controller before connecting or replaying.
 * @internal
 */
export interface ChannelConfigurationChannel extends ChannelConfigurationFactory {}

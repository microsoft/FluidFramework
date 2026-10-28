/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ChannelConfiguration,
	ChannelConfigurationDefinition,
} from "./channelConfiguration.js";

/**
 * Distinguishes creation-only settings from configuration read from channel attributes.
 * @internal
 */
export type SharedObjectConfigurationInitialization<TConfig extends ChannelConfiguration> =
	| { readonly kind: "create"; readonly initialConfiguration?: TConfig }
	| { readonly kind: "load" };

/**
 * Configuration support registered by a SharedObjectCore subclass during construction.
 * @internal
 */
export interface SharedObjectConfigurationOptions<TConfig extends ChannelConfiguration> {
	readonly definition: ChannelConfigurationDefinition<TConfig>;
	readonly initialization: SharedObjectConfigurationInitialization<TConfig>;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, isObject } from "@fluidframework/core-utils/internal";
import type {
	ConfiguredChannelAttributes,
	IChannel,
	IChannelAttributes,
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";

/**
 * Returns whether a channel or its factory declares support for the configuration protocol.
 * This checks reader support, not whether configuration is active for a channel instance.
 * @internal
 */
export function supportsChannelConfiguration(
	channelOrFactory: IChannel | IChannelFactory,
): boolean {
	return (
		"channelConfigurationProtocolVersion" in channelOrFactory &&
		channelOrFactory.channelConfigurationProtocolVersion === 1
	);
}

/**
 * Returns whether the attributes contain channel configuration.
 * Validates the persisted configuration's required properties, version, and revision.
 */
export function hasChannelConfiguration(
	attributes: IChannelAttributes,
): attributes is ConfiguredChannelAttributes {
	if (!("configuration" in attributes)) {
		return false;
	}
	const configuration = attributes.configuration;
	assert(
		isObject(configuration) &&
			"version" in configuration &&
			"revision" in configuration &&
			"values" in configuration,
		"Configuration is missing properties",
	);
	assert(configuration.version === 1, "Unsupported persisted configuration version");
	assert(
		typeof configuration.revision === "number" &&
			0 <= configuration.revision &&
			Number.isSafeInteger(configuration.revision),
		"Invalid revision",
	);
	return true;
}

/**
 * Checks that a marked instance installed the shared protocol rather than legacy dispatch.
 */
export function requireChannelConfigurationController(channel: IChannel): void {
	assert(
		supportsChannelConfiguration(channel),
		"Configured channel did not declare configuration support",
	);
}

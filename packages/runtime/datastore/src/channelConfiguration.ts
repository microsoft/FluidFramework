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
import { DataCorruptionError } from "@fluidframework/telemetry-utils/internal";

function invalidConfiguration(): never {
	throw new DataCorruptionError("Invalid or unsupported channel configuration", {});
}

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
 * Validates that configured snapshots are well-formed and that the supplied factory supports the protocol.
 */
export function hasChannelConfiguration(
	attributes: IChannelAttributes,
	factory?: IChannelFactory,
): attributes is ConfiguredChannelAttributes {
	if (!("configuration" in attributes)) {
		return false;
	}
	const configuration = attributes.configuration;
	if (
		!isObject(configuration) ||
		!("version" in configuration) ||
		configuration.version !== 1 ||
		!("revision" in configuration) ||
		typeof configuration.revision !== "number" ||
		!Number.isSafeInteger(configuration.revision) ||
		configuration.revision < 0 ||
		!("values" in configuration) ||
		!isObject(configuration.values) ||
		Array.isArray(configuration.values)
	) {
		invalidConfiguration();
	}
	if (factory !== undefined && !supportsChannelConfiguration(factory)) {
		throw new DataCorruptionError(
			"Channel factory does not support configuration protocol",
			{},
		);
	}
	return true;
}

/**
 * Checks that a marked instance installed the shared protocol rather than legacy dispatch.
 */
export function requireChannelConfigurationController(channel: IChannel): void {
	assert(
		supportsChannelConfiguration(channel),
		"Configured channel did not register its controller",
	);
}

/**
 * Checks that a marked channel has valid attributes and a registered controller.
 */
export function verifyChannelConfigurationController(channel: IChannel): void {
	if (!hasChannelConfiguration(channel.attributes)) {
		return;
	}
	requireChannelConfigurationController(channel);
}

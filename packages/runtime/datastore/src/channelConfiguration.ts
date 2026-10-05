/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type {
	ChannelConfigurationChannel,
	ChannelConfigurationFactory,
	ChannelConfigurationRuntime,
	ConfiguredChannelAttributes,
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { DataCorruptionError } from "@fluidframework/telemetry-utils/internal";

function invalidConfiguration(): never {
	throw new DataCorruptionError("Invalid or unsupported channel configuration", {});
}

/**
 * Validates the persisted protocol before handing any state to the DDS factory.
 */
export function validateChannelConfiguration(
	attributes: IChannelAttributes,
	factory?: IChannelFactory,
): attributes is ConfiguredChannelAttributes {
	if (!("configuration" in attributes)) {
		return false;
	}
	const configuration = attributes.configuration;
	if (
		typeof configuration !== "object" ||
		configuration === null ||
		Object.keys(configuration).length !== 3 ||
		!("version" in configuration) ||
		configuration.version !== 1 ||
		!("revision" in configuration) ||
		typeof configuration.revision !== "number" ||
		!Number.isSafeInteger(configuration.revision) ||
		configuration.revision < 0 ||
		Object.is(configuration.revision, -0) ||
		!("values" in configuration) ||
		typeof configuration.values !== "object" ||
		configuration.values === null ||
		Array.isArray(configuration.values)
	) {
		invalidConfiguration();
	}
	if (
		factory !== undefined &&
		(factory as IChannelFactory & ChannelConfigurationFactory)
			.channelConfigurationProtocolVersion !== 1
	) {
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
	const configured = channel as IChannel & ChannelConfigurationChannel;
	if (configured.channelConfigurationProtocolVersion !== 1) {
		throw new DataCorruptionError("Configured channel did not register its controller", {});
	}
}

/**
 * Checks document capability without changing channel attachment state.
 */
export function verifyChannelConfigurationCapability(
	channel: IChannel,
	runtime: IFluidDataStoreRuntime,
): void {
	if (!validateChannelConfiguration(channel.attributes)) {
		return;
	}
	requireChannelConfigurationController(channel);
	assert(
		(
			runtime as IFluidDataStoreRuntime & ChannelConfigurationRuntime
		).isChannelConfigurationEnabled?.(channel.attributes.type) === true,
		"Document channel configuration is not active for this type; cannot attach a configured channel",
	);
}

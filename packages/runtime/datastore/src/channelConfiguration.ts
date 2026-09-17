/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
import { DataCorruptionError, UsageError } from "@fluidframework/telemetry-utils/internal";

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
		(Object.getPrototypeOf(configuration) !== Object.prototype &&
			Object.getPrototypeOf(configuration) !== null) ||
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
	const ancestors = new Set<object>();
	const visit = (value: unknown): void => {
		if (value === null || typeof value === "string" || typeof value === "boolean") {
			return;
		}
		if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) {
			return;
		}
		if (
			typeof value !== "object" ||
			value === null ||
			ancestors.has(value) ||
			(Array.isArray(value)
				? Object.getPrototypeOf(value) !== Array.prototype
				: Object.getPrototypeOf(value) !== Object.prototype &&
					Object.getPrototypeOf(value) !== null) ||
			("type" in value && value.type === "__fluid_handle__")
		) {
			invalidConfiguration();
		}
		ancestors.add(value);
		if (Array.isArray(value)) {
			if (Object.keys(value).length !== value.length) {
				invalidConfiguration();
			}
			for (let i = 0; i < value.length; i++) {
				if (!Object.hasOwn(value, i)) {
					invalidConfiguration();
				}
			}
		}
		for (const key of Reflect.ownKeys(value)) {
			if (Array.isArray(value) && key === "length") {
				continue;
			}
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			if (
				typeof key !== "string" ||
				descriptor === undefined ||
				!("value" in descriptor) ||
				descriptor.enumerable !== true
			) {
				invalidConfiguration();
			}
			visit(descriptor.value);
		}
		ancestors.delete(value);
	};
	visit(configuration);
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
	if (
		configured.channelConfigurationProtocolVersion !== 1 ||
		typeof configured.onChannelConfigurationPublication !== "function"
	) {
		throw new DataCorruptionError("Configured channel did not register its controller", {});
	}
}

/**
 * Checks publication readiness without changing local configuration authority.
 */
export function verifyChannelConfigurationPublication(
	channel: IChannel,
	runtime: IFluidDataStoreRuntime,
): boolean {
	if (!validateChannelConfiguration(channel.attributes)) {
		return false;
	}
	requireChannelConfigurationController(channel);
	if (
		(runtime as IFluidDataStoreRuntime & ChannelConfigurationRuntime)
			.channelConfigurationEnabled !== true
	) {
		throw new UsageError("Enable document channel configuration before publishing a channel");
	}
	return true;
}

/**
 * Publishes a captured snapshot before connection callbacks or trailing ops can run.
 */
export function publishChannelConfiguration(
	channel: IChannel,
	runtime: IFluidDataStoreRuntime,
): void {
	if (verifyChannelConfigurationPublication(channel, runtime)) {
		(channel as IChannel & ChannelConfigurationChannel).onChannelConfigurationPublication?.();
	}
}

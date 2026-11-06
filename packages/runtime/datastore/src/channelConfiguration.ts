/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isObject } from "@fluidframework/core-utils/internal";
import type {
	ChannelConfigurationSnapshotV1,
	ConfiguredChannelAttributes,
	IChannelAttributes,
} from "@fluidframework/datastore-definitions/internal";

/**
 * Returns whether the value is a valid version 1 channel configuration snapshot.
 * The channel implementation validates the contents of the values.
 */
export function isChannelConfigurationSnapshotV1(
	value: unknown,
): value is ChannelConfigurationSnapshotV1 {
	return (
		isObject(value) &&
		"version" in value &&
		"revision" in value &&
		"values" in value &&
		value.version === 1 &&
		typeof value.revision === "number" &&
		0 <= value.revision &&
		Number.isSafeInteger(value.revision) &&
		isObject(value.values) &&
		!Array.isArray(value.values)
	);
}

/**
 * Returns whether the attributes contain valid channel configuration.
 */
export function isConfiguredChannelAttributes(
	attributes: IChannelAttributes,
): attributes is ConfiguredChannelAttributes {
	return (
		"configuration" in attributes && isChannelConfigurationSnapshotV1(attributes.configuration)
	);
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IChannelAttributes } from '@fluidframework/datastore-definitions/internal';

import { type IMigrationOp } from './migrationShim.js';
import { type IOpContents, type IStampedContents } from './types.js';

/**
 * Checks if two channel attributes objects match.
 * @param attributes1 - The first channel attributes object to compare.
 * @param attributes2 - The second channel attributes object to compare.
 * @returns True if the two channel attributes objects match, false otherwise.
 */
export function attributesMatch(attributes1: IChannelAttributes, attributes2: IChannelAttributes): boolean {
	return (
		attributes1.type === attributes2.type &&
		attributes1.packageVersion === attributes2.packageVersion &&
		attributes1.snapshotFormatVersion === attributes2.snapshotFormatVersion
	);
}

/**
 * Checks if the given op is a barrier op.
 * @param contents - The op to check.
 * @returns True if the op is a barrier op, false otherwise.
 */
export function isBarrierOp(contents: IOpContents): contents is IMigrationOp {
	return contents.type === 'barrier';
}

/**
 * Checks if the given op is a barrier op.
 * @param contents - The op to check.
 * @returns True if the op is a barrier op, false otherwise.
 */
export function isStampedOp(contents: IOpContents): contents is IStampedContents {
	return 'fluidMigrationStamp' in contents;
}

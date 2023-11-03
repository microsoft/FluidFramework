/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IChannelAttributes } from "@fluidframework/datastore-definitions";
import { MessageType, type ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { type IStampedContents } from "./types";

/**
 * Checks if two channel attributes objects match.
 * @param attributes1 - The first channel attributes object to compare.
 * @param attributes2 - The second channel attributes object to compare.
 * @returns True if the two channel attributes objects match, false otherwise.
 */
export function attributesMatch(
	attributes1: IChannelAttributes,
	attributes2: IChannelAttributes,
): boolean {
	return (
		attributes1.type === attributes2.type &&
		attributes1.packageVersion === attributes2.packageVersion &&
		attributes1.snapshotFormatVersion === attributes2.snapshotFormatVersion
	);
}

/**
 * This determines whether the message is stamped in the v2 format.
 *
 * @param message - the wrapped ISequenceDocumentMessage, the "op" envelope
 * @param attributes - the v2 attributes we expect to accept
 * @returns true if the message is stamped in the v2 format
 */
export function messageStampMatchesAttributes(
	message: ISequencedDocumentMessage,
	attributes: IChannelAttributes,
): boolean {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
	if (message.type !== MessageType.Operation) {
		return false;
	}
	const content = message.contents as IStampedContents;
	// Drop v1 ops
	if (
		content.fluidMigrationStamp === undefined ||
		!attributesMatch(content.fluidMigrationStamp, attributes)
	) {
		return false;
	}

	return true;
}

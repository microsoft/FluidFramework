/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage, ISequencedDocumentSystemMessage } from "@fluidframework/protocol-definitions";
import { str } from "crc-32";

// default hash/seed value.
export const defaultHash = "00000000";

const clientIdProperty: keyof ISequencedDocumentSystemMessage = "clientId";
const sequenceNumberProperty: keyof ISequencedDocumentSystemMessage = "sequenceNumber";
const minimumSequenceNumberProperty: keyof ISequencedDocumentSystemMessage = "minimumSequenceNumber";
const clientSequenceNumberProperty: keyof ISequencedDocumentSystemMessage = "clientSequenceNumber";
const referenceSequenceNumberProperty: keyof ISequencedDocumentSystemMessage = "referenceSequenceNumber";
const typeProperty: keyof ISequencedDocumentSystemMessage = "type";
const timestampProperty: keyof ISequencedDocumentSystemMessage = "timestamp";
const dataProperty: keyof ISequencedDocumentSystemMessage = "data";

// Ordering of these fields decides the ordering of serialized message.
const fields: string[] = [
    clientIdProperty,
    sequenceNumberProperty,
    minimumSequenceNumberProperty,
    clientSequenceNumberProperty,
    referenceSequenceNumberProperty,
    typeProperty,
    timestampProperty,
    dataProperty,
];

export function getNextHash(message: ISequencedDocumentMessage, lastHash: string): string {
    const messageWithData = message as ISequencedDocumentSystemMessage;
    // Should we just use stringified JSON or come up with our own serialization of values?
    const serializedMessage = JSON.stringify(messageWithData, fields);
    const hash = str(serializedMessage, parseInt(lastHash, 16));
    return hash.toString(16);
}

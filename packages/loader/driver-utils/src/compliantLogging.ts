import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

export function extractLogCompliantMessageProperties(
    message: Partial<ISequencedDocumentMessage>,
) {
    const safeProps: Partial<{
        messageClientId: string,
        sequenceNumber: number,
        clientSequenceNumber: number,
        referenceSequenceNumber: number,
        minimumSequenceNumber: number,
        messageTimestamp: number,
    }> = {};

    if (typeof message.clientId === "string") {
        safeProps.messageClientId = message.clientId;
    }

    if (typeof message.sequenceNumber === "number") {
        safeProps.sequenceNumber = message.sequenceNumber;
    }

    if (typeof message.clientSequenceNumber === "number") {
        safeProps.clientSequenceNumber = message.clientSequenceNumber;
    }

    if (typeof message.referenceSequenceNumber === "number") {
        safeProps.referenceSequenceNumber = message.referenceSequenceNumber;
    }

    if (typeof message.minimumSequenceNumber === "number") {
        safeProps.minimumSequenceNumber = message.minimumSequenceNumber;
    }

    if (typeof message.timestamp === "number") {
        safeProps.messageTimestamp = message.timestamp;
    }

    return safeProps;
}

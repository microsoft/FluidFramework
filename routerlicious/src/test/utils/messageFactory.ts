import { IDocumentMessage, NoOp } from "../../api";
import { IRawOperationMessage, RawOperationType } from "../../core";

export class MessageFactory {
    private clientSequenceNumber = 0;

    constructor(private documentId, private clientId) {
    }

    public create(referenceSequenceNumber = 0, timestamp = Date.now()): IRawOperationMessage {
        const operation: IDocumentMessage = {
            clientSequenceNumber: this.clientSequenceNumber++,
            contents: null,
            encrypted: false,
            encryptedContents: null,
            referenceSequenceNumber,
            type: NoOp,
        };

        const objectMessage: IRawOperationMessage = {
            clientId: this.clientId,
            documentId: this.documentId,
            operation,
            timestamp,
            type: RawOperationType,
            userId: null,
        };

        return objectMessage;
    }
}

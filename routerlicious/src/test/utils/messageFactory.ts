import { IDocumentMessage, NoOp } from "../../api";
import { IRawOperationMessage, RawOperationType } from "../../core";

export class MessageFactory {
    constructor(private documentId, private clientId) {
    }

    public create(): IRawOperationMessage {
        const operation: IDocumentMessage = {
            clientSequenceNumber: 0,
            contents: null,
            encrypted: false,
            encryptedContents: null,
            referenceSequenceNumber: 0,
            type: NoOp,
        };

        const objectMessage: IRawOperationMessage = {
            clientId: this.clientId,
            documentId: this.documentId,
            operation,
            timestamp: Date.now(),
            type: RawOperationType,
            userId: null,
        };

        return objectMessage;
    }
}

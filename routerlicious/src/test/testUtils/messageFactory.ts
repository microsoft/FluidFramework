import * as api from "../../api";
import { IRawOperationMessage, RawOperationType } from "../../core";

export class MessageFactory {
    private clientSequenceNumber = 0;

    constructor(private documentId, private clientId) {
    }

    public create(referenceSequenceNumber = 0, timestamp = Date.now()): IRawOperationMessage {
        const operation: api.IDocumentMessage = {
            clientSequenceNumber: this.clientSequenceNumber++,
            contents: null,
            encrypted: false,
            encryptedContents: null,
            referenceSequenceNumber,
            type: api.NoOp,
        };

        return this.createRawOperation(operation, timestamp, this.clientId);
    }

    public createJoin(timestamp = Date.now()) {
        const operation: api.IDocumentMessage = {
            clientSequenceNumber: -1,
            contents: this.clientId,
            encrypted: false,
            encryptedContents: null,
            referenceSequenceNumber: -1,
            type: api.ClientJoin,
        };

        return this.createRawOperation(operation, timestamp, null);
    }

    public createLeave(timestamp = Date.now()) {
        const operation: api.IDocumentMessage = {
            clientSequenceNumber: -1,
            contents: this.clientId,
            encrypted: false,
            encryptedContents: null,
            referenceSequenceNumber: -1,
            type: api.ClientLeave,
        };

        return this.createRawOperation(operation, timestamp, null);
    }

    public createRawOperation(operation: api.IDocumentMessage, timestamp, clientId) {
        const objectMessage: IRawOperationMessage = {
            clientId,
            documentId: this.documentId,
            operation,
            timestamp,
            type: RawOperationType,
            userId: null,
        };

        return objectMessage;
    }
}

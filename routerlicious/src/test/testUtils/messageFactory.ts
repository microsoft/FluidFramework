import * as api from "../../api-core";
import { IRawOperationMessage, ISequencedOperationMessage, RawOperationType, SequencedOperationType } from "../../core";

export class MessageFactory {
    private clientSequenceNumber = 0;
    private sequenceNumber = 0;

    constructor(private documentId, private clientId) {
    }

    public createDocumentMessage(referenceSequenceNumber = 0): api.IDocumentMessage {
        const operation: api.IDocumentMessage = {
            clientSequenceNumber: this.clientSequenceNumber++,
            contents: null,
            encrypted: false,
            encryptedContents: null,
            referenceSequenceNumber,
            traces: [],
            type: api.NoOp,
        };
        return operation;
    }

    public create(referenceSequenceNumber = 0, timestamp = Date.now()): IRawOperationMessage {
        const operation = this.createDocumentMessage(referenceSequenceNumber);
        return this.createRawOperation(operation, timestamp, this.clientId);
    }

    public createJoin(timestamp = Date.now()) {
        const operation: api.IDocumentMessage = {
            clientSequenceNumber: -1,
            contents: this.clientId,
            encrypted: false,
            encryptedContents: null,
            referenceSequenceNumber: -1,
            traces: [],
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
            traces: [],
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

    public createSequencedOperation(): ISequencedOperationMessage {
        const operation = this.createDocumentMessage(0);
        let sequencedOperation: api.ISequencedDocumentMessage = {
            clientId: this.clientId,
            clientSequenceNumber: operation.clientSequenceNumber,
            contents: operation.contents,
            encrypted: operation.encrypted,
            encryptedContents: operation.encryptedContents,
            minimumSequenceNumber: 0,
            referenceSequenceNumber: operation.referenceSequenceNumber,
            sequenceNumber: this.sequenceNumber++,
            traces: [],
            type: operation.type,
            userId: null,
        };

        const message: ISequencedOperationMessage = {
            documentId: this.documentId,
            operation: sequencedOperation,
            origin: undefined,
            type: SequencedOperationType,
        };

        return message;
    }
}

import hash = require("string-hash");
import * as api from "../../api-core";
import { IRawOperationMessage, ISequencedOperationMessage, RawOperationType, SequencedOperationType } from "../../core";
import * as utils from "../../utils";

export class KafkaMessageFactory {
    private offsets: number[] = [];

    constructor(public topic = "test", partitions = 1) {
        for (let i = 0; i < partitions; i++) {
            this.offsets.push(0);
        }
    }

    public sequenceMessage(value: any, key: string): utils.kafkaConsumer.IMessage {
        const partition = this.getPartition(key);
        const offset = this.offsets[partition]++;

        const kafkaMessage: utils.kafkaConsumer.IMessage = {
            highWaterOffset: offset,
            key,
            offset,
            partition,
            topic: this.topic,
            value: JSON.stringify(value),
        };

        return kafkaMessage;
    }

    public getHeadOffset(key: string) {
        return this.offsets[this.getPartition(key)] - 1;
    }

    private getPartition(key: string): number {
        return hash(key) % this.offsets.length;
    }
}

export class MessageFactory {
    private clientSequenceNumber = 0;
    private sequenceNumber = 0;

    constructor(private documentId, private clientId) {
    }

    public createDocumentMessage(referenceSequenceNumber = 0): api.IDocumentMessage {
        const operation: api.IDocumentMessage = {
            clientSequenceNumber: this.clientSequenceNumber++,
            contents: null,
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
            user: null,
        };

        return objectMessage;
    }

    public createSave(): ISequencedOperationMessage {
        const operation: api.IDocumentMessage = {
            clientSequenceNumber: this.clientSequenceNumber++,
            contents: {
                message: "Test Save",
            },
            referenceSequenceNumber: 0,
            traces: [],
            type: api.SaveOperation,
        };

        let sequencedOperation: api.ISequencedDocumentMessage = {
            clientId: this.clientId,
            clientSequenceNumber: operation.clientSequenceNumber,
            contents: operation.contents,
            minimumSequenceNumber: 0,
            origin: undefined,
            referenceSequenceNumber: operation.referenceSequenceNumber,
            sequenceNumber: this.sequenceNumber++,
            traces: [],
            type: operation.type,
            user: null,
        };

        const message: ISequencedOperationMessage = {
            documentId: this.documentId,
            operation: sequencedOperation,
            type: SequencedOperationType,
        };

        return message;
    }

    public createSequencedOperation(): ISequencedOperationMessage {
        const operation = this.createDocumentMessage(0);
        let sequencedOperation: api.ISequencedDocumentMessage = {
            clientId: this.clientId,
            clientSequenceNumber: operation.clientSequenceNumber,
            contents: operation.contents,
            minimumSequenceNumber: 0,
            origin: undefined,
            referenceSequenceNumber: operation.referenceSequenceNumber,
            sequenceNumber: this.sequenceNumber++,
            traces: [],
            type: operation.type,
            user: null,
        };

        const message: ISequencedOperationMessage = {
            documentId: this.documentId,
            operation: sequencedOperation,
            type: SequencedOperationType,
        };

        return message;
    }
}

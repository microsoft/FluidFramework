import { IDocumentMessage, ISequencedDocumentMessage, MessageType } from "@prague/runtime-definitions";
// tslint:disable-next-line:no-var-requires
const hash = require("string-hash");
import { IRawOperationMessage, ISequencedOperationMessage, RawOperationType, SequencedOperationType } from "../../core";
import * as utils from "../../utils";

export class KafkaMessageFactory {
    private offsets: number[] = [];

    constructor(public topic = "test", partitions = 1) {
        for (let i = 0; i < partitions; i++) {
            this.offsets.push(0);
        }
    }

    public sequenceMessage(value: any, key: string): utils.IMessage {
        const partition = this.getPartition(key);
        const offset = this.offsets[partition]++;

        const kafkaMessage: utils.IMessage = {
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

    constructor(private documentId, private clientId, private tenantId = "test") {
    }

    public createDocumentMessage(referenceSequenceNumber = 0): IDocumentMessage {
        const operation: IDocumentMessage = {
            clientSequenceNumber: this.clientSequenceNumber++,
            contents: null,
            referenceSequenceNumber,
            type: MessageType.NoOp,
        };
        return operation;
    }

    public create(referenceSequenceNumber = 0, timestamp = Date.now()): IRawOperationMessage {
        const operation = this.createDocumentMessage(referenceSequenceNumber);
        return this.createRawOperation(operation, timestamp, this.clientId);
    }

    public createJoin(timestamp = Date.now()) {
        const operation: IDocumentMessage = {
            clientSequenceNumber: -1,
            contents: { clientId: this.clientId },
            referenceSequenceNumber: -1,
            type: MessageType.ClientJoin,
        };

        return this.createRawOperation(operation, timestamp, null);
    }

    public createLeave(timestamp = Date.now()) {
        const operation: IDocumentMessage = {
            clientSequenceNumber: -1,
            contents: this.clientId,
            referenceSequenceNumber: -1,
            type: MessageType.ClientLeave,
        };

        return this.createRawOperation(operation, timestamp, null);
    }

    public createRawOperation(operation: IDocumentMessage, timestamp, clientId) {
        const objectMessage: IRawOperationMessage = {
            clientId,
            documentId: this.documentId,
            operation,
            tenantId: this.tenantId,
            timestamp,
            type: RawOperationType,
            user: null,
        };

        return objectMessage;
    }

    public createSave(): ISequencedOperationMessage {
        const operation: IDocumentMessage = {
            clientSequenceNumber: this.clientSequenceNumber++,
            contents: {
                message: "Test Save",
            },
            referenceSequenceNumber: 0,
            type: MessageType.Save,
        };

        const sequencedOperation: ISequencedDocumentMessage = {
            clientId: this.clientId,
            clientSequenceNumber: operation.clientSequenceNumber,
            contents: operation.contents,
            minimumSequenceNumber: 0,
            origin: undefined,
            referenceSequenceNumber: operation.referenceSequenceNumber,
            sequenceNumber: this.sequenceNumber++,
            type: operation.type,
            user: null,
        };

        const message: ISequencedOperationMessage = {
            documentId: this.documentId,
            operation: sequencedOperation,
            tenantId: this.tenantId,
            type: SequencedOperationType,
        };

        return message;
    }

    public createSequencedOperation(): ISequencedOperationMessage {
        const operation = this.createDocumentMessage(0);
        const sequencedOperation: ISequencedDocumentMessage = {
            clientId: this.clientId,
            clientSequenceNumber: operation.clientSequenceNumber,
            contents: operation.contents,
            minimumSequenceNumber: 0,
            origin: undefined,
            referenceSequenceNumber: operation.referenceSequenceNumber,
            sequenceNumber: this.sequenceNumber++,
            type: operation.type,
            user: null,
        };

        const message: ISequencedOperationMessage = {
            documentId: this.documentId,
            operation: sequencedOperation,
            tenantId: this.tenantId,
            type: SequencedOperationType,
        };

        return message;
    }
}

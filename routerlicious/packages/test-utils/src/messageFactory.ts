import { IDocumentMessage, ISequencedDocumentMessage, MessageType } from "@prague/container-definitions";
import {
    BoxcarType,
    IBoxcarMessage,
    IKafkaMessage,
    IRawOperationMessage,
    ISequencedOperationMessage,
    RawOperationType,
    SequencedOperationType,
} from "@prague/services-core";
import hash = require("string-hash");

export class KafkaMessageFactory {
    private offsets: number[] = [];

    constructor(
        public topic = "test",
        partitions = 1,
        private stringify = true,
        private tenantId: string = null,
        private documentId: string = null) {
        for (let i = 0; i < partitions; i++) {
            this.offsets.push(0);
        }
    }

    public sequenceMessage(value: any, key: string): IKafkaMessage {
        const partition = this.getPartition(key);
        const offset = this.offsets[partition]++;

        const kafkaMessage: IKafkaMessage = {
            highWaterOffset: offset,
            key,
            offset,
            partition,
            topic: this.topic,
            value: this.stringify
                ? JSON.stringify(value)
                : ({
                    contents: [value],
                    documentId: this.documentId,
                    tenantId: this.tenantId,
                    type: BoxcarType,
                } as IBoxcarMessage),
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
            metadata: {
                content: null,
                split: false,
            },
            referenceSequenceNumber,
            traces: [],
            type: MessageType.Operation,
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
            contents: null,
            metadata: {
                content: { clientId: this.clientId },
                split: false,
            },
            referenceSequenceNumber: -1,
            traces: [],
            type: MessageType.ClientJoin,
        };

        return this.createRawOperation(operation, timestamp, null);
    }

    public createLeave(timestamp = Date.now()) {
        const operation: IDocumentMessage = {
            clientSequenceNumber: -1,
            contents: this.clientId,
            metadata: {
                content: this.clientId,
                split: false,
            },
            referenceSequenceNumber: -1,
            traces: [],
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
        };

        return objectMessage;
    }

    public createSave(): ISequencedOperationMessage {
        const operation: IDocumentMessage = {
            clientSequenceNumber: this.clientSequenceNumber++,
            contents: "Test Save",
            metadata: {
                content: null,
                split: false,
            },
            referenceSequenceNumber: 0,
            traces: [],
            type: MessageType.Save,
        };

        const sequencedOperation: ISequencedDocumentMessage = {
            clientId: this.clientId,
            clientSequenceNumber: operation.clientSequenceNumber,
            contents: operation.contents,
            metadata: operation.metadata,
            minimumSequenceNumber: 0,
            origin: undefined,
            referenceSequenceNumber: operation.referenceSequenceNumber,
            sequenceNumber: this.sequenceNumber++,
            timestamp: Date.now(),
            traces: [],
            type: operation.type,
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
            metadata: operation.metadata,
            minimumSequenceNumber: 0,
            origin: undefined,
            referenceSequenceNumber: operation.referenceSequenceNumber,
            sequenceNumber: this.sequenceNumber++,
            timestamp: Date.now(),
            traces: [],
            type: operation.type,
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

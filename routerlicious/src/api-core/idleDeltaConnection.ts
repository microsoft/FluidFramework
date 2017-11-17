import { IDeltaConnection, IDocument } from "./document";
import { IBranchOrigin, IObjectMessage, ITrace } from "./protocol";

// Mimics a connection to a delta notification stream for document loading.
export class IdleDeltaConnection implements IDeltaConnection {

    public minSequenceNumber: number;

    public refSequenceNumber: number;

    public get minimumSequenceNumber(): number {
        return this.minSequenceNumber;
    }

    public get referenceSequenceNumber(): number {
        return this.refSequenceNumber;
    }

    public get baseSequenceNumber(): number {
        return 0;
    }

    constructor(public objectId: string, public document: IDocument) {
    }

    public setBaseMapping(sequenceNumber: number, documentSequenceNumber: number) {
        // No implementation
    }

    public baseMappingIsSet(): boolean {
        return true;
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        return this;
    }

    public emit(
        message: IObjectMessage,
        clientId: string,
        documentSequenceNumber: number,
        documentMinimumSequenceNumber: number,
        origin: IBranchOrigin,
        traces: ITrace[]) {
        // No implementation
    }

    public transformDocumentSequenceNumber(value: number) {
        // No implementation
    }

    public updateMinSequenceNumber(value: number) {
        // No implementation
    }

    /**
     * Send new messages to the server
     */
    public submit(message: IObjectMessage): Promise<void> {
        return Promise.resolve();
    }
}

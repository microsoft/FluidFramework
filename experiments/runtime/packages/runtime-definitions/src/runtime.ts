import { ISequencedDocumentMessage } from "./protocol";

/**
 * Message handler definition
 */
export interface IMessageHandler {
    prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any>;

    process(message: ISequencedDocumentMessage, context: any, local: boolean): void;
}

export interface IRuntime {
    readonly id: string;

    readonly existing: boolean;

    readonly options: any;

    readonly clientId: string;

    getChannel(id: string): any;

    // The above 3 things don't let the code loader do any fine grained loading - but that is probably ok?
    // There may be opportunities where I can re-use an object across runs assuming the version of the data type/code
    // have not changed?

    // A channel defines a dist data type and its associated op stream of changes to it. In whole the document
    // is a JSON DB.
}

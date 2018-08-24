import { IDistributedObjectServices } from "./channel";
import { ISequencedDocumentMessage } from "./protocol";
import { IUser } from "./users";

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

    readonly user: IUser;

    getChannel(id: string): any;

    createChannel(id: string, type: string): IDistributedObjectServices;

    // A channel defines a dist data type and its associated op stream of changes to it. In whole the document
    // is a JSON DB.
}

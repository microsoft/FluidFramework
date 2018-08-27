import { IChannel } from "./chaincode";
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

    /**
     * Returns the channel with the given id
     */
    getChannel(id: string): IChannel;

    /**
     * Creates a new channel of the given type
     */
    createChannel(id: string, type: string): IChannel;

    /**
     * Attaches the channel to the runtime - exposing it ot remote clients
     */
    attachChannel(channel: IChannel): IDistributedObjectServices;

    /**
     * Waits for the given channel to show up
     */
    waitForChannel(id: string): Promise<void>;
}

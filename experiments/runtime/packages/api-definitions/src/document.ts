import {
    IDistributedObjectServices,
    IEnvelope,
    IUser,
} from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { ICollaborativeObject } from "./types";

export interface IDeltaManager {
    // The queue of inbound delta messages
    inbound: IDeltaQueue;

    // the queue of outbound delta messages
    outbound: IDeltaQueue;
}

export interface IDeltaQueue extends EventEmitter {
    /**
     * Flag indicating whether or not the queue was paused
     */
    paused: boolean;

    /**
     * The number of messages remaining in the queue
     */
    length: number;

    /**
     * Flag indicating whether or not the queue is empty
     */
    empty: boolean;

    /**
     * Pauses processing on the queue
     */
    pause();

    /**
     * Resumes processing on the queue
     */
    resume();
}

export interface IDocument {
    id: string;

    clientId: string;

    deltaManager: IDeltaManager;

    options: any;

    create(type: string, id?: string): ICollaborativeObject;

    attach(object: ICollaborativeObject): IDistributedObjectServices;

    get(id: string): Promise<ICollaborativeObject>;

    getUser(): IUser;

    snapshot(message: string): Promise<void>;

    submitObjectMessage(envelope: IEnvelope);
}

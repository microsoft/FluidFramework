import { IUser } from "@prague/container-definitions";
import { IDistributedObjectServices, IRuntime } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { ISharedObject } from "./types";

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
     * Flag indicating whether or not the queue is idle
     */
    idle: boolean;

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

    options: any;

    runtime: IRuntime;

    attach(object: ISharedObject): IDistributedObjectServices;

    get(id: string): Promise<ISharedObject>;

    getUser(): IUser;
}

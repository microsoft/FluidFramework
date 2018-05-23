// tslint:disable:ban-types
import * as socketStorage from "../socket-storage";
import { StateManager} from "./stateManager";

/**
 * State of a document.
 */
export interface IDocumentState {
    tenantId: string;

    documentId: string;

    workers: Array<{ detail: IWorkerDetail, workType: string }>; // Array<<IWorkerDetail, workType>>

    activeTS: number;
}

/**
 * Detail Description of worker used by tmz
 */
export interface IWorkerDetail {
    // Worker object
    worker: socketStorage.IWorker;

    // Socket object
    socket: any;
}

/**
 * Type of work and desired worker type.
 */
export interface IWork {
    workType: string;

    workerType: string;
}

/**
 * Type of Document and Work.
 */
export interface IDocumentWork {
    tenantId: string;

    documentId: string;

    work: IWork;
}

/**
 * Interface to implement the Work manager.
 */
export interface IForeman {

    /**
     * Broadcasts a new agent arrival to workers.
     */
    broadcastNewAgentModule(moduleName: string, workerType: string, action: string): void;

    /**
     * Assigns tasks to workers based on some heuristics.
     */
    assignWork(workToDo: IDocumentWork[]): Array<Promise<void>>;

    /**
     * Revokes expired work. Already implemented in base class.
     */
    revokeExpiredWork(): Array<Promise<void>>;

    /**
     * Returns underlying State Manager. Already implemented in base class.
     */
    getManager(): StateManager;

}

/**
 * Type of agent and name.
 */
export interface IAgent {

    type: string;

    name: string;
}

/**
 * Interface to implement the agent loader.
 */
export interface IAgentUploader {

    /**
     * Preps the underlying storage.
     */
    initialize(): void;

    /**
     * Notifies on the event of an agent added/deleted.
     */
    on(event: "agentAdded" | "agentRemoved", listener: (message: IAgent) => void): this;

    /**
     * Notifies on error.
     */
    on(event: string, listener: Function): this;

}

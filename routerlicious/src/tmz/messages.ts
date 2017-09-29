import * as socketStorage from "../socket-storage";
import { StateManager} from "./stateManager";

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
 * State of a worker.
 */
export interface IWorkerState {

    worker: IWorkerDetail;

    documents: Array<[string, string]>;  // Array<<docId, workType>>

    activeTS: number;
}

/**
 * State of a document.
 */
export interface IDocumentState {

    docId: string;

    workers: Array<[IWorkerDetail, string]>; // Array<<IWorkerDetail, workType>>

    activeTS: number;
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

    docId: string;

    work: IWork;
}

/**
 * Interface to implement the Work manager.
 */
export interface IForeman {

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

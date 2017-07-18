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

    documents: string[];

    activeTS: number;
}

/**
 * State of a document.
 */
export interface IDocumentState {

    id: string;

    worker: IWorkerDetail;

    activeTS: number;
}

/**
 * Interface to implement the Work manager.
 */
export interface IForeman {

    /**
     * Assigns tasks to workers based on some heuristics.
     */
    assignWork(id: string[]): Array<Promise<void>>;

    /**
     * Revokes expired work. Already implemented in base class.
     */
    revokeExpiredWork(): Array<Promise<void>>;

    /**
     * Returns underlying State Manager. Already implemented in base class.
     */
    getManager(): StateManager;

}

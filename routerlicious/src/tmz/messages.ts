import * as socketStorage from "../socket-storage";

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
 * Interface to choose the next worker
 */
export interface IWorkManager {
    /**
     * Assigns tasks to workers based on some heuristics.
     */
    assignWork(id: string[]): Array<Promise<void>>;
}

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

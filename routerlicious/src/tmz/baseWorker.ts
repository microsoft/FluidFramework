import * as socketStorage from "../socket-storage";
import { logger } from "../utils";
import { IWorkerDetail } from "./messages";
import { StateManager} from "./stateManager";

/**
 * Worker methods shared by all implementations.
 */
export class BaseWorker {

    protected manager: StateManager;

    public revokeExpiredWork(): Array<Promise<void>> {
        const docs = this.manager.getExpiredDocuments();
        return docs.map((doc) => this.revokeOne(doc.id, doc.worker));
    }

    private revokeOne(id: string, worker: IWorkerDetail): Promise<void> {
        return new Promise<any>((resolve, reject) => {
            worker.socket.emit("RevokeObject", worker.worker.clientId, id,
                (error, ack: socketStorage.IWorker) => {
                    if (ack) {
                        this.manager.revokeWork(worker, id);
                        resolve();
                    } else {
                        logger.error(error);
                    }
            });
        });
    }
}

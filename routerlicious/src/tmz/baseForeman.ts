import * as nconf from "nconf";
import * as winston from "winston";
import * as socketStorage from "../socket-storage";
import { IWorkerDetail } from "./messages";
import { StateManager} from "./stateManager";

/**
 * Worker methods shared by all implementations.
 */
export class BaseForeman {

    public manager: StateManager;
    protected ackTimeout: number;

    constructor() {
        this.manager = new StateManager(nconf.get("tmz:timeoutMSec:worker"), nconf.get("tmz:timeoutMSec:document"),
                                        nconf.get("tmz:tasks"));
        this.ackTimeout = nconf.get("tmz:workerAckTimeMSec");
    }

    public getManager(): StateManager {
        return this.manager;
    }

    public revokeExpiredWork(): Array<Promise<void>> {
        const docs = this.manager.getExpiredDocuments();
        const revokedPromises = [];
        for (let doc of docs) {
            for (let worker of doc.workers) {
                revokedPromises.push(this.revokeOne(doc.docId, worker[1], worker[0]));
            }
        }
        return revokedPromises;
    }

    public broadcastNewAgentModule(moduleName: string) {
        // TODO: Need some rule here to distinguish between server and client module.
        for (const worker of this.manager.getActiveWorkers()) {
            worker.socket.emit("AgentObject", worker.worker.clientId, moduleName,
            (nack, ack: socketStorage.IWorker) => {
                if (ack) {
                    winston.info(`${worker.worker.clientId} is ready to load ${moduleName}`);
                } else {
                    winston.info(nack);
                }
            });
        }
    }

    private revokeOne(id: string, workType: string, worker: IWorkerDetail): Promise<void> {
        return new Promise<any>((resolve, reject) => {
            worker.socket.emit("RevokeObject", worker.worker.clientId, id, workType,
                (error, ack: socketStorage.IWorker) => {
                    if (ack) {
                        this.manager.revokeWork(worker, id, workType);
                        resolve();
                    } else {
                        winston.error(error);
                    }
            });
        });
    }
}

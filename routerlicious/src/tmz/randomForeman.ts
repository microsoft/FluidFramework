import * as socketStorage from "../socket-storage";
import { logger } from "../utils";
import { BaseForeman } from "./baseForeman";
import { IForeman, IWorkerDetail } from "./messages";

/**
 * Worker that picks worker randomly.
 */
export class RandomForeman extends BaseForeman implements IForeman {

    constructor() {
        super();
    }

    public assignWork(ids: string[]): Array<Promise<void>> {
        const activeWorkers = this.manager.getActiveWorkers();
        return ids.map((id) => this.assignOne(id, activeWorkers));
    }

    private assignOne(id: string, workers: IWorkerDetail[]): Promise<void> {
        const candidates = [];
        // Check how many workers are on board and make a candiate array.
        for (let worker of workers) {
            worker.socket.emit("ReadyObject", worker.worker.clientId, id, (error, ack: socketStorage.IWorker) => {
                if (ack) {
                    candidates.push(worker);
                } else {
                    logger.error(error);
                }
            });
        }
        return new Promise<any>((resolve, reject) => {
            setTimeout(() => {
                const pickedWorker = candidates[Math.floor(Math.random() * candidates.length)];
                pickedWorker.socket.emit("TaskObject", pickedWorker.worker.clientId, id,
                    (error, ack: socketStorage.IWorker) => {
                        if (ack) {
                            this.manager.assignWork(pickedWorker, id);
                            resolve();
                        } else {
                            logger.error(error);
                        }
                });
            }, this.ackTimeout);
        });
    }
}

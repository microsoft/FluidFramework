import * as socketStorage from "../socket-storage";
import { logger } from "../utils";
import { BaseWorker } from "./baseWorker";
import { IWorkerDetail, IWorkManager } from "./messages";

/**
 * Worker that picks worker randomly.
 */
export class RandomWorker extends BaseWorker implements IWorkManager {

    constructor() {
        super();
    }

    public assignWork(ids: string[]): Array<Promise<void>> {
        const activeWorkers = this.manager.getActiveWorkers();
        return ids.map((id) => this.assignOne(id, activeWorkers));
    }

    private assignOne(id: string, workers: IWorkerDetail[]): Promise<void> {
        const candidates = [];
        const shuffledWorkers = this.shuffle(workers);
        // Check how many workers are on board. Then pick one randomly.
        const readyP =  new Promise<any>((resolve, reject) => {
            for (let worker of shuffledWorkers) {
                worker.socket.emit("ReadyObject", worker.worker.clientId, id, (error, ack: socketStorage.IWorker) => {
                    if (ack) {
                        candidates.push(worker);
                        resolve();
                    } else {
                        logger.error(error);
                    }
                });
            }
        });
        return new Promise<any>((resolve, reject) => {
            readyP.then(() => {
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
            });
        });
    }

    private shuffle(array: any[]): any[] {
        let currentIndex = array.length;
        let temporaryValue: any;
        let randomIndex: number;

        while (0 !== currentIndex) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            --currentIndex;

            temporaryValue = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temporaryValue;
        }
        return array;
    }

}

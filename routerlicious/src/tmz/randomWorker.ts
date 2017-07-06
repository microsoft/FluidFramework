import * as socketStorage from "../socket-storage";
import { logger } from "../utils";
import { IWorkerDetail, IWorkManager } from "./messages";
import { StateManager} from "./stateManager";

export class RandomWorker implements IWorkManager {

    constructor(private manager: StateManager) {
    }

    public assignWork(ids: string[]): Array<Promise<void>> {
        return ids.map((id) => this.assignOne(id, this.manager.getWorkers()));
    }

    private assignOne(id: string, workers: IWorkerDetail[]): Promise<void> {
        const candidates = [];
        const shuffledWorkers = this.shuffle(workers);
        const readyP =  new Promise<any>((resolve, reject) => {
            for (let worker of shuffledWorkers) {
                worker.socket.emit("ReadyObject", worker.worker.clientId, id, (error, ack: socketStorage.IWorker) => {
                    if (ack) {
                        logger.info(`Client ${ack.clientId} is ready for the work`);
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
                            logger.info(`Client ${ack.clientId} started the work`);
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

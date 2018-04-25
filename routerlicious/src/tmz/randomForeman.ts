import * as winston from "winston";
import * as api from "../api-core";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";
import { BaseForeman } from "./baseForeman";
import { IDocumentWork, IForeman, IWorkerDetail } from "./messages";

/**
 * Worker that picks worker randomly.
 */
export class RandomForeman extends BaseForeman implements IForeman {
    constructor(private tenantManager: api.ITenantManager) {
        super();
    }

    public assignWork(workToDo: IDocumentWork[]): Array<Promise<void>> {
        const workPromises = [];
        let workers: any;
        for (let work of workToDo) {
            winston.info(`Requesting worker type ${work.work.workerType} for document id ${work.documentId}`);
            switch (work.work.workerType) {
                case "server":
                    workers = this.manager.getActiveServerWorkers();
                    workPromises.push(this.assignOne(work, workers));
                    break;
                case "client":
                    workers = this.manager.getActiveClientWorkers();
                    // Additional check since there might not be any browser client available.
                    if (workers !== undefined && workers.length > 0) {
                        winston.info(`${workers.length} client workers found!`);
                        workPromises.push(this.assignOne(work, workers));
                    }
                    break;
                case "both":
                    workers = this.manager.getActiveWorkers();
                    workPromises.push(this.assignOne(work, workers));
                    break;
                default:
                    throw new Error("Unknown worker type!");
            }
        }
        return workPromises;
    }

    private async assignOne(work: IDocumentWork, workers: IWorkerDetail[]): Promise<void> {
        const candidates = [];
        // Check how many workers are on board and make a candiate array.
        for (let worker of workers) {
            worker.socket.emit(
                "ReadyObject",
                worker.worker.clientId,
                work.tenantId,
                work.documentId,
                work.work.workType,
                (nack, ack: socketStorage.IWorker) => {
                    if (ack) {
                        winston.info(`${work.work.workType} is acked from ${worker.worker.clientId}`);
                        candidates.push(worker);
                    } else {
                        winston.info(nack);
                    }
            });
        }

        const key = await this.tenantManager.getKey(work.tenantId);

        return new Promise<any>((resolve, reject) => {
            setTimeout(() => {
                if (candidates.length > 0) {
                    const pickedWorker = candidates[Math.floor(Math.random() * candidates.length)];
                    // tslint:disable-next-line:max-line-length
                    winston.info(`Picked worker ${pickedWorker.worker.clientId} for work ${work.work.workType} document ${work.tenantId}/${work.documentId}`);
                    pickedWorker.socket.emit(
                        "TaskObject",
                        pickedWorker.worker.clientId,
                        work.tenantId,
                        work.documentId,
                        utils.generateToken(work.tenantId, work.documentId, key),
                        work.work.workType,
                        (error, ack: socketStorage.IWorker) => {
                            if (ack) {
                                this.manager.assignWork(
                                    pickedWorker,
                                    work.tenantId,
                                    work.documentId,
                                    work.work.workType);
                                resolve();
                            } else {
                                winston.error(error);
                                reject();
                            }
                    });
                } else {
                    reject();
                }
            }, this.ackTimeout);
        });
    }
}

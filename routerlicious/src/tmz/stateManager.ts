import * as _ from "lodash";
import { IDocumentState, IWorkerDetail, IWorkerState } from "./messages";

export class StateManager {
    private workerToDocumentMap: { [socketId: string]: IWorkerState} = {};
    private documentToWorkerMap: { [docId: string]: IDocumentState} = {};

    constructor(private workerTimeout: number, private documentTimeout: number) {
    }

    public addWorker(worker: IWorkerDetail) {
        this.workerToDocumentMap[worker.socket.id] = { worker, documents: [], activeTS: Date.now() };
    }

    public removeWorker(worker: IWorkerDetail) {
        delete this.workerToDocumentMap[worker.socket.id];
    }

    public assignWork(worker: IWorkerDetail, docId: string) {
        this.workerToDocumentMap[worker.socket.id].documents.push(docId);
        this.documentToWorkerMap[docId] = { id: docId, worker, activeTS: Date.now() };
    }

    public revokeWork(worker: IWorkerDetail, docId: string) {
        let index = this.workerToDocumentMap[worker.socket.id].documents.indexOf(docId, 0);
        if (index > -1) {
            this.workerToDocumentMap[worker.socket.id].documents.splice(index, 1);
        }
        delete this.documentToWorkerMap[docId];
    }

    public refreshWorker(socketId: string) {
        this.workerToDocumentMap[socketId].activeTS = Date.now();
    }

    public getWorker(socketId: string): IWorkerDetail {
        return this.workerToDocumentMap[socketId].worker;
    }

    public getWorkers(): IWorkerDetail[] {
        return _.values(this.workerToDocumentMap).map((worker) => worker.worker);
    }

    public getActiveWorkers(): IWorkerDetail[] {
        return _.values(this.workerToDocumentMap)
                .filter((workerState) => { return (Date.now() - workerState.activeTS) <= this.workerTimeout; })
                .map((workerState) => workerState.worker);
    }

    public getDocumentsFromInactiveWorkers(): string[] {
        return _.flatten(
               _.values(this.workerToDocumentMap)
                .filter((workerState) => { return (Date.now() - workerState.activeTS) > this.workerTimeout; })
                .map((workerState) => workerState.documents));
    }

    public getDocuments(worker: IWorkerDetail): string[] {
        return this.workerToDocumentMap[worker.socket.id].documents;
    }

    public updateDocumentIfFound(id: string): boolean {
        if (id in this.documentToWorkerMap) {
            this.documentToWorkerMap[id].activeTS = Date.now();
            return true;
        }
        return false;
    }

    public getExpiredDocuments(): IDocumentState[] {
        return _.values(this.documentToWorkerMap)
                .filter((document) => {
                    return (Date.now() - document.activeTS) > this.documentTimeout;
                });
    }

}

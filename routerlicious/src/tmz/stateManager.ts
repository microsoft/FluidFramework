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
        // Remove all documents associated with the worker first.
        this.workerToDocumentMap[worker.socket.id].documents.map((document) => {
            delete this.documentToWorkerMap[document];
        });
        // Delete the worker now.
        delete this.workerToDocumentMap[worker.socket.id];
    }

    public assignWork(worker: IWorkerDetail, docId: string) {
        this.workerToDocumentMap[worker.socket.id].documents.push(docId);
        this.documentToWorkerMap[docId] = { id: docId, worker, activeTS: Date.now() };
    }

    public revokeWork(worker: IWorkerDetail, docId: string) {
        let docIndex = this.workerToDocumentMap[worker.socket.id].documents.indexOf(docId, 0);
        if (docIndex > -1) {
            this.workerToDocumentMap[worker.socket.id].documents.splice(docIndex, 1);
        }
        delete this.documentToWorkerMap[docId];
    }

    public refreshWorker(socketId: string) {
        this.workerToDocumentMap[socketId].activeTS = Date.now();
    }

    public getWorker(socketId: string): IWorkerDetail {
        return this.workerToDocumentMap[socketId].worker;
    }

    public getActiveWorkers(): IWorkerDetail[] {
        return _.values(this.workerToDocumentMap)
                .filter((workerState) => { return (Date.now() - workerState.activeTS) <= this.workerTimeout; })
                .map((workerState) => workerState.worker);
    }

    public revokeDocumentsFromInactiveWorkers(): string[] {
        const documents = [];
        for (let worker of _.keys(this.workerToDocumentMap)) {
            if (Date.now() - this.workerToDocumentMap[worker].activeTS > this.workerTimeout) {
                documents.push(this.workerToDocumentMap[worker].documents);
                this.workerToDocumentMap[worker].documents = [];
            }
        }
        return documents;
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

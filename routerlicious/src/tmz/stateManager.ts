import * as _ from "lodash";
import { IDocumentState, IDocumentWork, IWork, IWorkerDetail, IWorkerState } from "./messages";

export class StateManager {
    private workerToDocumentMap: { [workerId: string]: IWorkerState} = {};
    private documentToWorkerMap: { [docId: string]: IDocumentState} = {};

    constructor(private workerTimeout: number, private documentTimeout: number, private tasks: any) {
    }

    public addWorker(worker: IWorkerDetail) {
        this.workerToDocumentMap[worker.socket.id] = { worker, documents: [], activeTS: Date.now() };
    }

    public removeWorker(worker: IWorkerDetail) {
        // Remove all documents worker associated with the worker first.
        this.workerToDocumentMap[worker.socket.id].documents.map((document) => {
            this.removeWorkerFromDocument(document[0], document[1]);
        });
        // Delete the worker now.
        delete this.workerToDocumentMap[worker.socket.id];
    }

    public assignWork(worker: IWorkerDetail, docId: string, workType: string) {
        this.workerToDocumentMap[worker.socket.id].documents.push([docId, workType]);
        if (!(docId in this.documentToWorkerMap)) {
            this.addDocument(docId);
        }
        this.documentToWorkerMap[docId].workers.push([worker, workType]);
    }

    public revokeWork(worker: IWorkerDetail, docId: string, workType: string) {
        let docIndex = this.workerToDocumentMap[worker.socket.id].documents.indexOf([docId, workType], 0);
        if (docIndex > -1) {
            this.workerToDocumentMap[worker.socket.id].documents.splice(docIndex, 1);
        }
        if (docId in this.documentToWorkerMap) {
            delete this.documentToWorkerMap[docId];
        }
    }

    public refreshWorker(worker: IWorkerDetail) {
        if (!(worker.socket.id in this.workerToDocumentMap)) {
            this.addWorker(worker);
        } else {
            this.workerToDocumentMap[worker.socket.id].activeTS = Date.now();
        }
    }

    public getWorker(workerId: string): IWorkerDetail {
        if (!(workerId in this.workerToDocumentMap)) {
            return;
        }
        return this.workerToDocumentMap[workerId].worker;
    }

    public getActiveWorkers(): IWorkerDetail[] {
        return _.values(this.workerToDocumentMap)
                .filter((workerState) => { return (Date.now() - workerState.activeTS) <= this.workerTimeout; })
                .map((workerState) => workerState.worker);
    }

    public getActiveServerWorkers(): IWorkerDetail[] {
        return this.getActiveWorkers().filter((worker) => worker.worker.type === "Paparazzi");
    }

    public getActiveClientWorkers(): IWorkerDetail[] {
        return this.getActiveWorkers().filter((worker) => worker.worker.type === "Client");
    }

    public revokeDocumentsFromInactiveWorkers(): IDocumentWork[] {
        const returnedWorks: IDocumentWork[] = [];
        const expiredWorkers = this.getExpiredWorkers();
        for (let worker of expiredWorkers) {
            for (let document of this.getDocuments(worker)) {
                returnedWorks.push(document);
            }
        }
        return returnedWorks;
    }

    public getDocuments(worker: IWorkerDetail): IDocumentWork[] {
        const returnedWorks: IDocumentWork[] = [];
        const workerState = this.workerToDocumentMap[worker.socket.id];
        for (let document of workerState.documents) {
            const work: IWork = { workType: document[1], workerType: this.tasks[document[1]] };
            returnedWorks.push({docId: document[0], work});
        }
        return returnedWorks;
    }

    public getExpiredDocuments(): IDocumentState[] {
        return _.values(this.documentToWorkerMap)
                .filter((document) => {
                    return (Date.now() - document.activeTS) > this.documentTimeout;
                });
    }

    public updateDocumentIfFound(id: string): boolean {
        if (id in this.documentToWorkerMap) {
            this.documentToWorkerMap[id].activeTS = Date.now();
            return true;
        }
        return false;
    }

    private addDocument(docId: string) {
        this.documentToWorkerMap[docId] = {docId, workers: [], activeTS: Date.now() };
    }

    private removeWorkerFromDocument(docId: string, workType: string) {
        let documentState = this.documentToWorkerMap[docId];
        let workerIndex: number = -1;
        if (documentState !== undefined) {
            for (let i = 0; i < documentState.workers.length; i++) {
                if (workType === documentState.workers[i][1]) {
                    workerIndex = i;
                    break;
                }
            }
        }
        if (workerIndex !== -1) {
            this.documentToWorkerMap[docId].workers.splice(workerIndex, 1);
        }
    }

    private getExpiredWorkers(): IWorkerDetail[] {
        const expiredWorkers: IWorkerDetail[] = [];
        for (let worker of _.keys(this.workerToDocumentMap)) {
            const workerState = this.workerToDocumentMap[worker];
            if (Date.now() - workerState.activeTS > this.workerTimeout) {
                expiredWorkers.push(workerState.worker);
            }
        }
        return expiredWorkers;
    }

}

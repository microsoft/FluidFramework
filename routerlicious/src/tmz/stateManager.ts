import * as _ from "lodash";
import { IWorkerDetail} from "./messages";

interface IWorkerState {

    worker: IWorkerDetail;

    documents: string[];
}

export class StateManager {
    private workerToDocumentMap: { [socketId: string]: IWorkerState} = {};
    private documentToWorkerMap: { [docId: string]: IWorkerDetail} = {};

    public addWorker(worker: IWorkerDetail) {
        this.workerToDocumentMap[worker.socket.id] = {worker, documents: []};
    }

    public removeWorker(worker: IWorkerDetail) {
        delete this.workerToDocumentMap[worker.socket.id];
    }

    public assignWork(worker: IWorkerDetail, docId: string) {
        if (!(worker.socket.id in this.workerToDocumentMap)) {
            this.workerToDocumentMap[worker.socket.id] = {worker, documents: [docId]};
        } else {
            this.workerToDocumentMap[worker.socket.id].documents.push(docId);
        }
        this.documentToWorkerMap[docId] = worker;
    }

    public revokeWork(worker: IWorkerDetail, docId: string) {
        let index = this.workerToDocumentMap[worker.socket.id].documents.indexOf(docId, 0);
        if (index > -1) {
            this.workerToDocumentMap[worker.socket.id].documents.splice(index, 1);
        }
        delete this.documentToWorkerMap[docId];
    }

    public getWorker(socketId: string): IWorkerDetail {
        return this.workerToDocumentMap[socketId].worker;
    }

    public getWorkers(): IWorkerDetail[] {
        return _.values(this.workerToDocumentMap).map((worker) => worker.worker);
    }

    public getDocuments(worker: IWorkerDetail): string[] {
        return this.workerToDocumentMap[worker.socket.id].documents;
    }

}

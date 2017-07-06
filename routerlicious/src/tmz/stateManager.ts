import * as _ from "lodash";
import { IWorkerDetail} from "./messages";

interface IWorkerState {

    worker: IWorkerDetail;

    documents: string[];
}

export class StateManager {

    private workerToDocumentMap: { [workerId: string]: IWorkerState} = {};
    private documentToWorkerMap: { [docId: string]: IWorkerDetail} = {};

    public addWorker(worker: IWorkerDetail) {
        this.workerToDocumentMap[worker.worker.clientId] = {worker, documents: []};
    }

    public removeWorker(worker: IWorkerDetail) {
        delete this.workerToDocumentMap[worker.worker.clientId];
    }

    public assignWork(worker: IWorkerDetail, docId: string) {
        if (!(worker.worker.clientId in this.workerToDocumentMap)) {
            this.workerToDocumentMap[worker.worker.clientId] = {worker, documents: [docId]};
        } else {
            this.workerToDocumentMap[worker.worker.clientId].documents.push(docId);
        }
        this.documentToWorkerMap[docId] = worker;
    }

    public revokeWork(worker: IWorkerDetail, docId: string) {
        let index = this.workerToDocumentMap[worker.worker.clientId].documents.indexOf(docId, 0);
        if (index > -1) {
            this.workerToDocumentMap[worker.worker.clientId].documents.splice(index, 1);
        }
        delete this.documentToWorkerMap[docId];
    }

    public getWorkers(): IWorkerDetail[] {
        return _.values(this.workerToDocumentMap).map((worker) => worker.worker);
    }

    public getDocuments(worker: IWorkerDetail): string[] {
        return this.workerToDocumentMap[worker.worker.clientId].documents;
    }

}

import { IDocumentState, IDocumentWork, IWork, IWorkerDetail } from "./messages";

/**
 * State of a worker.
 */
interface IWorkerState {
    worker: IWorkerDetail;

    documents: Array<{tenantId: string, documentId: string, workType: string }>;

    activeTS: number;
}

export class StateManager {
    private workerToDocumentMap = new Map<string, IWorkerState>();
    private documentToWorkerMap = new Map<string, IDocumentState>();

    constructor(private workerTimeout: number, private documentTimeout: number, private tasks: any) {
    }

    public addWorker(worker: IWorkerDetail) {
        this.workerToDocumentMap.set(
            worker.socket.id,
            {
                activeTS: Date.now(),
                documents: [],
                worker,
            });
    }

    public removeWorker(worker: IWorkerDetail) {
        // Remove all documents worker associated with the worker first.
        this.workerToDocumentMap.get(worker.socket.id).documents.map((document) => {
            this.removeWorkerFromDocument(
                document.tenantId,
                document.documentId,
                document.workType);
        });

        // Delete the worker now.
        this.workerToDocumentMap.delete(worker.socket.id);
    }

    public assignWork(worker: IWorkerDetail, tenantId: string, documentId: string, workType: string) {
        const fullId = this.getFullId(tenantId, documentId);
        this.workerToDocumentMap.get(worker.socket.id).documents.push(
            {
                documentId,
                tenantId,
                workType,
            });
        if (!this.documentToWorkerMap.has(fullId)) {
            this.addDocument(tenantId, documentId);
        }
        this.documentToWorkerMap.get(fullId).workers.push({ detail: worker, workType });
    }

    public revokeWork(worker: IWorkerDetail, tenantId: string, documentId: string, workType: string) {
        const docIndex = this.workerToDocumentMap.get(worker.socket.id).documents.findIndex(
            (element) => {
                return element.documentId === documentId &&
                    element.tenantId === tenantId &&
                    element.workType === workType;
            });

        if (docIndex !== -1) {
            this.workerToDocumentMap.get(worker.socket.id).documents.splice(docIndex, 1);
        }

        const fullId = this.getFullId(tenantId, documentId);
        if (this.documentToWorkerMap.has(fullId)) {
            this.documentToWorkerMap.delete(fullId);
        }
    }

    public refreshWorker(worker: IWorkerDetail) {
        if (!this.workerToDocumentMap.has(worker.socket.id)) {
            this.addWorker(worker);
        } else {
            this.workerToDocumentMap.get(worker.socket.id).activeTS = Date.now();
        }
    }

    public getWorker(workerId: string): IWorkerDetail {
        if (!this.workerToDocumentMap.has(workerId)) {
            return;
        }

        return this.workerToDocumentMap.get(workerId).worker;
    }

    public getActiveWorkers(): IWorkerDetail[] {
        return Array.from(this.workerToDocumentMap.values())
            .filter((workerState) => (Date.now() - workerState.activeTS) <= this.workerTimeout)
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
        for (const worker of expiredWorkers) {
            for (const document of this.getDocuments(worker)) {
                returnedWorks.push(document);
            }
        }
        return returnedWorks;
    }

    public getDocuments(worker: IWorkerDetail): IDocumentWork[] {
        const returnedWorks: IDocumentWork[] = [];
        const workerState = this.workerToDocumentMap.get(worker.socket.id);
        for (const document of workerState.documents) {
            const work: IWork = { workType: document[1], workerType: this.tasks[document[1]] };
            returnedWorks.push({
                documentId: document.documentId,
                tenantId: document.tenantId,
                work,
            });
        }

        return returnedWorks;
    }

    public getExpiredDocuments(): IDocumentState[] {
        return Array.from(this.documentToWorkerMap.values())
            .filter((document) => (Date.now() - document.activeTS) > this.documentTimeout);
    }

    public updateDocumentIfFound(tenantId: string, documentId: string): boolean {
        const fullId = this.getFullId(tenantId, documentId);
        if (this.documentToWorkerMap.has(fullId)) {
            this.documentToWorkerMap.get(fullId).activeTS = Date.now();
            return true;
        }
        return false;
    }

    private addDocument(tenantId: string, documentId: string) {
        const fullId = this.getFullId(tenantId, documentId);
        this.documentToWorkerMap.set(
            fullId,
            {
                activeTS: Date.now(),
                documentId,
                tenantId,
                workers: [],
            });
    }

    private removeWorkerFromDocument(tenantId: string, documentId: string, workType: string) {
        const fullId = this.getFullId(tenantId, documentId);

        const documentState = this.documentToWorkerMap.get(fullId);
        let workerIndex: number = -1;
        if (documentState) {
            for (let i = 0; i < documentState.workers.length; i++) {
                if (workType === documentState.workers[i].workType) {
                    workerIndex = i;
                    break;
                }
            }
        }

        if (workerIndex !== -1) {
            documentState.workers.splice(workerIndex, 1);
        }
    }

    private getExpiredWorkers(): IWorkerDetail[] {
        const expiredWorkers: IWorkerDetail[] = [];
        for (const [, workerState] of this.workerToDocumentMap) {
            if (Date.now() - workerState.activeTS > this.workerTimeout) {
                expiredWorkers.push(workerState.worker);
            }
        }
        return expiredWorkers;
    }

    private getFullId(tenantId: string, documentId: string) {
        return `${tenantId}/${documentId}`;
    }
}

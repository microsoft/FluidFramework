import * as agent from "@prague/routerlicious/dist/agent";
// import { MergeTree } from "@prague/routerlicious/dist/client-api";
import { EventEmitter } from "events";

// Responsible for managing the lifetime of an work.
export class WorkManager extends EventEmitter implements agent.IWorkManager {

    // private documentMap: { [docId: string]: { [work: string]: agent.IWork} } = {};
    private events = new EventEmitter();

    // TODO: All params should be private
    constructor(public serviceFactory: any,
                public config: any,
                public serverUrl: string,
                public agentModuleLoader: (id: string) => Promise<any>,
                public clientType: string,
                public workTypeMap: { [workType: string]: boolean}) {
        super();
    }

    public async processDocumentWork(tenantId: string, documentId: string, workType: string,
                                     action: string, token?: string) {
        if (action === "start") {
            await this.startDocumentWork(tenantId, documentId, token, workType);
        } else {
            this.stopDocumentWork(tenantId, documentId, workType);
        }
    }

    public async processAgentWork(agentName: string, action: string) {
        return;
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    private async startDocumentWork(tenantId: string, documentId: string, token: string, workType: string) {
        const services = await this.serviceFactory.getService(tenantId);

        switch (workType) {
            default:
                console.log(`Start work for ${tenantId}/${documentId}`);
                console.log(services);
        }

    }

    private stopDocumentWork(tenantId: string, documentId: string, workType: string) {
        switch (workType) {
            default:
            console.log(`Stop work for ${tenantId}/${documentId}`);
        }
    }

    /*
    private getFullId(tenantId: string, documentId: string): string {
        return `${tenantId}/${documentId}`;
    }

    private async startTask(tenantId: string, documentId: string, workType: string, worker: IWork) {
        const fullId = this.getFullId(tenantId, documentId);

        if (worker) {
            if (!(fullId in this.documentMap)) {
                const emptyMap: { [work: string]: IWork } = {};
                this.documentMap[fullId] = emptyMap;
            }
            if (!(workType in this.documentMap[fullId])) {
                await this.applyWork(fullId, workType, worker);
            }
        }
    }

    private stopTask(tenantId: string, documentId: string, workType: string) {
        const fullId = this.getFullId(tenantId, documentId);

        if (fullId in this.documentMap) {
            const taskMap = this.documentMap[fullId];
            const task = taskMap[workType];
            if (task !== undefined) {
                task.stop();
                delete taskMap[workType];
            }
        }
    }

    private async applyWork(fullId: string, workType: string, worker: IWork) {
        console.log(`Starting work ${workType} for document ${fullId}`);
        await worker.start();
        console.log(`Started work ${workType} for document ${fullId}`);
        this.documentMap[fullId][workType] = worker;
        // Register existing intel agents to this document
        if (workType === "intel") {
            this.registerAgentsToNewDocument(fullId, workType);
        }
        worker.on("error", (error) => {
            this.events.emit("error", error);
        });
    }*/

}

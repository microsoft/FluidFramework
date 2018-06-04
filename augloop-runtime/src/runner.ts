import * as agent from "@prague/routerlicious/dist/agent";
import { IDocumentService, ITenantManager } from "@prague/routerlicious/dist/api-core";
import { Deferred } from "@prague/routerlicious/dist/core-utils";
import * as socketStorage from "@prague/routerlicious/dist/socket-storage";
import * as utils from "@prague/routerlicious/dist/utils";
import * as winston from "winston";
import { WorkManager } from "./augloop-worker";

class DocumentServiceFactory implements agent.IDocumentServiceFactory {
    constructor(private serverUrl: string, private historianUrl: string) {
    }

    public async getService(tenantId: string): Promise<IDocumentService> {
        // Disable browser error tracking for paparazzi.
        const services = socketStorage.createDocumentService(this.serverUrl, this.historianUrl, tenantId, false);
        return services;
    }
}

export class AugLoopRunner implements utils.IRunner {
    private workerService: agent.WorkerService;
    private running = new Deferred<void>();

    constructor(
        alfredUrl: string,
        tmzUrl: string,
        workerConfig: any,
        tenantManager: ITenantManager) {

        const runnerType = "paparazzi";
        const workTypeMap: { [workType: string]: boolean} = {};
        for (const workType of workerConfig.permission[runnerType]) {
            workTypeMap[workType] = true;
        }

        const factory = new DocumentServiceFactory(alfredUrl, workerConfig.blobStorageUrl);

        const workManager = new WorkManager(
            factory,
            workerConfig,
            alfredUrl,
            this.initLoadModule(alfredUrl),
            runnerType,
            workTypeMap);

        this.workerService = new agent.WorkerService(
            tmzUrl,
            workerConfig,
            workTypeMap,
            workManager);

        // Report any service error.
        this.workerService.on("error", (error) => {
            winston.error(error);
        });
    }

    public start(): Promise<void> {
        const workerRunningP = this.workerService.connect("Paparazzi");
        workerRunningP.then(() => this.running.resolve(), (error) => this.running.reject(error));

        return this.running.promise;
    }
    public stop(): Promise<void> {
        this.workerService.close().then(() => this.running.resolve(), (error) => this.running.reject(error));
        return this.running.promise;
    }

    private initLoadModule(alfredUrl: string): (name: string) => Promise<any> {
        return (moduleFile: string) => {
            return new Promise<any>((resolve, reject) => {
                resolve();
            });
        };
    }
}

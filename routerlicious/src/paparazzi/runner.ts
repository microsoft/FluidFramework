import * as fs from "fs";
import * as request from "request";
import * as unzip from "unzip-stream";
import * as url from "url";
import * as winston from "winston";
import * as agent from "../agent";
import { IDocumentService, IQueueMessage} from "../api-core";
import { Deferred } from "../core-utils";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";
import { IMessage, IMessageReceiver } from "./messages";

class DocumentServiceFactory implements agent.IDocumentServiceFactory {
    constructor(private serverUrl: string, private historianUrl: string) {
    }

    public async getService(tenantId: string): Promise<IDocumentService> {
        // Disabling browser error tracking for paparazzi.
        const services = socketStorage.createDocumentService(this.serverUrl, this.historianUrl, tenantId, false);
        return services;
    }
}

export class PaparazziRunner implements utils.IRunner {
    private workerService: agent.WorkerService;
    private running = new Deferred<void>();
    private permission: Set<string>;

    constructor(
        private alfredUrl: string,
        private workerConfig: any,
        private messageReceiver: IMessageReceiver) {

        const runnerType = "paparazzi";
        this.permission = new Set(workerConfig.permission as string[]);

        const factory = new DocumentServiceFactory(this.alfredUrl, workerConfig.blobStorageUrl);

        this.workerService = new agent.WorkerService(
            factory,
            this.workerConfig,
            this.alfredUrl,
            this.initLoadModule(this.alfredUrl),
            runnerType,
            this.permission);

        // Report any service error.
        this.workerService.on("error", (error) => {
            winston.error(error);
        });
    }

    public async start(): Promise<void> {
        // Preps message receiver.
        await this.messageReceiver.initialize().catch((err) => {
            this.running.reject(err);
        });
        this.messageReceiver.on("error", (err) => {
            this.running.reject(err);
        });
        this.messageReceiver.on("message", (message: IMessage) => {
            const type = message.type;
            // The api supports start and stopping of tasks. But for now we just handle starting.
            if (type === "task") {
                const requestMessage = message.content as IQueueMessage;
                this.processDocumentWork(requestMessage);
            }
        });

        return this.running.promise;
    }

    public processDocumentWork(requestMsg: IQueueMessage) {
        // Only start tasks that are allowed to run.
        const filteredTask = requestMsg.message.tasks.filter((task) => this.permission.has(task));

        winston.info(`Starting ${filteredTask} for ${requestMsg.tenantId}/${requestMsg.documentId}`);
        this.workerService.startTasks(
            requestMsg.tenantId,
            requestMsg.documentId,
            filteredTask,
            requestMsg.token).catch((err) => {
                // tslint:disable-next-line
                winston.error(`Error starting ${filteredTask} for ${requestMsg.tenantId}/${requestMsg.documentId}: ${err}`);
            });
    }
    public stop(): Promise<void> {
        return this.running.promise;
    }

    private initLoadModule(alfredUrl: string): (name: string) => Promise<any> {
        return (moduleFile: string) => {
            const moduleUrl = url.resolve(alfredUrl, `agent/${moduleFile}`);
            const moduleName = moduleFile.split(".")[0];
            winston.info(`Worker will load ${moduleName}`);

            // TODO - switch these to absolute paths

            return new Promise<any>((resolve, reject) => {
                fs.access(`../../../tmp/intel_modules/${moduleName}`, (error) => {
                    // Module already exists locally. Just import it!
                    if (!error) {
                      winston.info(`Module ${moduleName} already exists locally`);
                      import(`../../../../../tmp/intel_modules/${moduleName}/${moduleName}`).then((loadedModule) => {
                            winston.info(`${moduleName} loaded!`);
                            resolve(loadedModule);
                        }, (err) => {
                            reject(err);
                        });
                    } else {    // Otherwise load the module from db, write it locally, and import it.
                        request
                        .get(moduleUrl)
                        .on("response", (response) => {
                            if (response.statusCode !== 200) {
                                reject(`Invalid response code while fetching custom module: ${response.statusCode}`);
                            }
                        })
                        .on("error", (err) => {
                            reject(`Error requesting intel module from server: ${err}`);
                        })
                        // Unzipping one level nested to avoid collision with any OS generated folder/file.
                        .pipe(unzip.Extract({ path: `../../../tmp/intel_modules/${moduleName}` })
                        .on("error", (err) => {
                            reject(`Error writing unzipped module ${moduleName}: ${err}`);
                        })
                        .on("close", () => {
                            import(`../../../../../tmp/intel_modules/${moduleName}/${moduleName}`)
                            .then((loadedModule) => {
                                winston.info(`${moduleName} loaded!`);
                                resolve(loadedModule);
                            });
                        }));
                    }
                });
            });
        };
    }
}

import * as fs from "fs";
import * as request from "request";
import * as unzip from "unzip-stream";
import * as url from "url";
import * as winston from "winston";
import * as agent from "../agent";
import { IDocumentService} from "../api-core";
import { Deferred } from "../core-utils";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";
import { IMessage, IMessageReceiver } from "./messages";

// TODO can likely consolidate the runner and the worker service

class DocumentServiceFactory implements agent.IDocumentServiceFactory {
    constructor(private serverUrl: string, private historianUrl: string) {
    }

    public async getService(tenantId: string): Promise<IDocumentService> {
        // Disable browser error tracking for paparazzi.
        const services = socketStorage.createDocumentService(this.serverUrl, this.historianUrl, tenantId, false);
        return services;
    }
}

export class PaparazziRunner implements utils.IRunner {
    private workerService: agent.WorkerService;
    private running = new Deferred<void>();

    constructor(
        alfredUrl: string,
        tmzUrl: string,
        workerConfig: any,
        private messageReceiver: IMessageReceiver) {

        const runnerType = "paparazzi";
        const workTypeMap: { [workType: string]: boolean} = {};
        for (const workType of workerConfig.permission[runnerType]) {
            workTypeMap[workType] = true;
        }

        const factory = new DocumentServiceFactory(alfredUrl, workerConfig.blobStorageUrl);

        const workManager = new agent.WorkManager(
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

    public async start(): Promise<void> {
        // const workerRunningP = this.workerService.connect("Paparazzi");
        // workerRunningP.then(() => this.running.resolve(), (error) => this.running.reject(error));

        // Preps message receiver.
        await this.messageReceiver.initialize().catch((err) => {
            this.running.reject(err);
        });
        this.messageReceiver.on("error", (err) => {
            this.running.reject(err);
        });
        this.messageReceiver.on("message", (message: IMessage) => {
            winston.info(`Paparazzi received a help message`);
            winston.info(JSON.stringify(message));
            /* {"content":{"clientId":"halting-bedroom",
            "tasks":["spell","intel","translation","augmentation"]},"type":"task"} */
        });

        return this.running.promise;
    }
    public stop(): Promise<void> {
        // this.workerService.close().then(() => this.running.resolve(), (error) => this.running.reject(error));
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

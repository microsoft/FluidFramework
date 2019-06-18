/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as agent from "@prague/agent";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IPragueResolvedUrl,
    IResolvedUrl,
} from "@prague/container-definitions";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import * as socketStorage from "@prague/routerlicious-socket-storage";
import { IQueueMessage } from "@prague/runtime-definitions";
import { NodeCodeLoader } from "@prague/services";
import * as core from "@prague/services-core";
import * as utils from "@prague/services-utils";
import { Deferred } from "@prague/utils";
import * as fs from "fs";
import * as jwt from "jsonwebtoken";
import * as request from "request";
import * as unzip from "unzip-stream";
import * as url from "url";
import * as winston from "winston";

const npmRegistry = "https://packages.wu2.prague.office-int.com";
// Timeout for package installation.
const packageWaitTimeoutMS = 60000;
// Directory for running npm install. This directory needs to have a .npmrc and package.json file.
const packagesBase = `/tmp/chaincode`;

class WorkerDocumentServiceFactory implements IDocumentServiceFactory {
    public createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {

        if (resolvedUrl.type !== "prague") {
            Promise.reject("only prague type urls can be resolved.");
        }

        const urlAsPragueUrl = resolvedUrl as IPragueResolvedUrl;

        const ordererUrl = urlAsPragueUrl.endpoints.ordererUrl;
        const storageUrl = urlAsPragueUrl.endpoints.storageUrl;
        const deltaStorageUrl = urlAsPragueUrl.endpoints.deltaStorageUrl;

        if (!ordererUrl || !storageUrl || !deltaStorageUrl) {
            // tslint:disable-next-line:max-line-length
            Promise.reject(`endpoint urls must exist: [ordererUrl:${ordererUrl}][storageUrl:${storageUrl}][deltaStorageUrl:${deltaStorageUrl}]`);
        }

        const parsedUrl = url.parse(urlAsPragueUrl.url);
        const [, tenantId, documentId] = parsedUrl.path.split("/");
        if (!documentId || !tenantId) {
            // tslint:disable-next-line:max-line-length
            return Promise.reject(`Couldn't parse documentId and/or tenantId. [documentId:${documentId}][tenantId:${tenantId}]`);
        }

        const jwtToken = urlAsPragueUrl.tokens.jwt;
        if (!jwtToken) {
            return Promise.reject(`Token was not provided.`);
        }

        const tokenProvider = new socketStorage.TokenProvider(jwtToken);

        return Promise.resolve(
            socketStorage.createDocumentService(
                ordererUrl,
                deltaStorageUrl,
                storageUrl,
                tokenProvider,
                tenantId,
                documentId));
    }
}

export class PaparazziRunner implements utils.IRunner {
    private workerService: agent.WorkerService;
    private running = new Deferred<void>();
    private permission: Set<string>;

    constructor(
        private workerConfig: any,
        private messageReceiver: core.ITaskMessageReceiver,
        private agentUploader: core.IAgentUploader,
        private jwtKey: string,
    ) {
        this.permission = new Set(workerConfig.permission as string[]);
        const alfredUrl = workerConfig.alfredUrl;

        const serviceFactory = new WorkerDocumentServiceFactory();

        this.workerService = new agent.WorkerService(
            serviceFactory,
            this.workerConfig,
            alfredUrl,
            this.initLoadModule(alfredUrl),
            new NodeCodeLoader(npmRegistry, packagesBase, packageWaitTimeoutMS));
    }

    public async start(): Promise<void> {
        // Preps message receiver and agent uploader.
        const messageReceiverP = this.messageReceiver.initialize();
        const agentUploaderP = this.agentUploader.initialize();
        await Promise.all([messageReceiverP, agentUploaderP]).catch((err) => {
            this.running.reject(err);
        });

        // Should reject on message receiver error.
        this.messageReceiver.on("error", (err) => {
            this.running.reject(err);
        });

        // Accept a task.
        this.messageReceiver.on("message", (message: core.ITaskMessage) => {
            const type = message.type;
            if (type === "tasks:start") {
                const requestMessage = message.content as IQueueMessage;
                this.startDocumentWork(requestMessage);
            }
        });

        // Listen and respond to stop events.
        this.workerService.on("stop", (ev: agent.IDocumentTaskInfo) => {
            this.workerService.stopTask(ev.tenantId, ev.docId, ev.task);
        });

        // Respond to uploaded/removed agents.
        this.agentUploader.on("agentAdded", (agentModule: core.IAgent) => {
            if (agentModule.type === "server") {
                winston.info(`New agent package uploaded: ${agentModule.name}`);
                this.loadAgent(agentModule.name as string);

                // Converting to webpacked scripts is disabled for now. Need to figure out an way to do it only once.
                // const moduleUrl = url.resolve(this.alfredUrl, `/agent/js/${agent.name}`);
                // request.post(moduleUrl);
            } else if (agentModule.type === "client") {
                winston.info(`New agent script uploaded: ${agentModule.name}`);
                // TODO: Figure out an way to send this message to browser clients.
            }
        });
        this.agentUploader.on("agentRemoved", (agentModule: core.IAgent) => {
            if (agentModule.type === "server") {
                winston.info(`Agent package removed: ${agentModule.name}`);
                this.unloadAgent(agentModule.name as string);
            } else if (agentModule.type === "client") {
                winston.info(`Agent script removed`);
                // TODO: Figure out an way to send this message to browser clients.
            }
        });
        this.agentUploader.on("error", (err) => {
            // Report on agent uploader error.
            winston.error(err);
        });

        // Report any service error.
        this.workerService.on("error", (error) => {
            winston.error(error);
        });

        return this.running.promise;
    }

    public stop(): Promise<void> {
        return this.running.promise;
    }

    private startDocumentWork(requestMsg: IQueueMessage) {
        // Only start tasks that are allowed to run.
        const filteredTask = requestMsg.message.tasks.filter((task) => this.permission.has(task));

        if (filteredTask.length > 0) {
            const hostToken = jwt.sign(
                {
                    user: "paparazzi",
                },
                this.jwtKey);

            const documentUrl = `prague://${url.parse(this.workerConfig.alfredUrl).host}` +
                `/${encodeURIComponent(requestMsg.tenantId)}` +
                `/${encodeURIComponent(requestMsg.documentId)}`;

            const deltaStorageUrl =
                this.workerConfig.alfredUrl +
                "/deltas" +
                `/${encodeURIComponent(requestMsg.tenantId)}/${encodeURIComponent(requestMsg.documentId)}`;

            const storageUrl =
                this.workerConfig.blobStorageUrl +
                "/repos" +
                `/${encodeURIComponent(requestMsg.tenantId)}`;

            const resolved: IPragueResolvedUrl = {
                endpoints: {
                    deltaStorageUrl,
                    ordererUrl: this.workerConfig.alfredUrl,
                    storageUrl,
                },
                tokens: { jwt: requestMsg.token },
                type: "prague",
                url: documentUrl,
            };

            const resolver = new ContainerUrlResolver(
                this.workerConfig.alfredUrl,
                hostToken,
                new Map([[documentUrl, resolved]]));

            winston.info(`Starting ${JSON.stringify(filteredTask)}: ${requestMsg.tenantId}/${requestMsg.documentId}`);
            this.workerService.startTasks(
                this.workerConfig.alfredUrl,
                requestMsg.tenantId,
                requestMsg.documentId,
                filteredTask,
                { resolver }).catch((err) => {
                    winston.error(
                        // tslint:disable-next-line
                        `Error starting ${JSON.stringify(filteredTask)}: ${requestMsg.tenantId}/${requestMsg.documentId}: ${err}`
                    );
                });
        }
    }

    private loadAgent(agentName: string) {
        winston.info(`Request received to load ${agentName}`);
        this.workerService.loadAgent(agentName).catch((err) => {
            winston.error(`Error loading agent ${agentName}: ${err}`);
        });
    }

    private unloadAgent(agentName: string) {
        winston.info(`Request received to unload ${agentName}`);
        this.workerService.unloadAgent(agentName);
    }

    private initLoadModule(alfredUrl: string): (name: string) => Promise<any> {
        return (moduleFile: string) => {
            const moduleUrl = url.resolve(alfredUrl, `agent/${moduleFile}`);
            const moduleName = moduleFile.split(".")[0];
            winston.info(`Task runner will load ${moduleName}`);

            return new Promise<any>((resolve, reject) => {
                fs.access(`/tmp/intel_modules/${moduleName}`, (error) => {
                    // Module already exists locally. Just import it!
                    if (!error) {
                      winston.info(`Module ${moduleName} already exists locally`);
                      import(`/tmp/intel_modules/${moduleName}/${moduleName}`).then(
                        (loadedModule) => {
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
                        .pipe(unzip.Extract({ path: `/tmp/intel_modules/${moduleName}` })
                        .on("error", (err) => {
                            reject(`Error writing unzipped module ${moduleName}: ${err}`);
                        })
                        .on("close", () => {
                            import(`/tmp/intel_modules/${moduleName}/${moduleName}`)
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

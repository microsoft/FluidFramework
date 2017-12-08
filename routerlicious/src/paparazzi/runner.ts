import * as fs from "fs";
import * as request from "request";
import * as unzip from "unzip-stream";
import * as url from "url";
import * as winston from "winston";
import * as agent from "../agent";
import { Deferred } from "../core-utils";
import * as utils from "../utils";

// TODO can likely consolidate the runner and the worker service

export class PaparazziRunner implements utils.IRunner {
    private workerService: agent.WorkerService;
    private running = new Deferred<void>();

    constructor(
        alfredUrl: string,
        tmzUrl: string,
        workerConfig: string,
        historianUrl: string,
        repo: string) {

        this.workerService = new agent.WorkerService(
            alfredUrl,
            tmzUrl,
            historianUrl,
            repo,
            workerConfig,
            "paparazzi",
            this.initLoadModule(alfredUrl));
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
            const moduleUrl = url.resolve(alfredUrl, `agent/${moduleFile}`);
            const moduleName = moduleFile.split(".")[0];
            winston.info(`Worker will load ${moduleName}`);

            return new Promise<any>((resolve, reject) => {
                fs.access(`intel_modules/${moduleName}`, (error) => {
                    // Module already exists locally. Just import it!
                    if (!error) {
                      winston.info(`Module ${moduleName} already exists locally`);
                      import(`../../intel_modules/${moduleName}/${moduleName}`).then((loadedModule) => {
                            winston.info(`${moduleName} loaded!`);
                            resolve(loadedModule);
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
                        .pipe(unzip.Extract({ path: `intel_modules/${moduleName}` })
                        .on("error", (err) => {
                            reject(`Error writing unzipped module ${moduleName}: ${err}`);
                        })
                        .on("close", () => {
                            import(`../../intel_modules/${moduleName}/${moduleName}`).then((loadedModule) => {
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

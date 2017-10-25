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
            "paparazzi");
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
}

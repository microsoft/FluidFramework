import { WorkerService } from "./workerService";

export function registerWorker(config: any) {
    const workerUrl =  `${document.location.protocol}//${document.location.hostname}:${config.port.worker}`;

    // Bootstrap service and connect.
    const workerService = new WorkerService(document.location.origin, workerUrl, config);
    workerService.connect("client").catch(() => {
        console.log(`Error initiating worker`);
    });
}

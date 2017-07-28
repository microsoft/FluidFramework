import { WorkerService} from ".";

export function registerWorker(config: any) {
    const workerUrl =  config.url;

    // Bootstrap service and connect.
    const workerService = new WorkerService(document.location.origin, workerUrl, config);
    workerService.connect("client").catch(() => {
        console.log(`Error initiating worker`);
    });
}

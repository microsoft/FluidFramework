import { WorkerService} from ".";

export function registerWorker(config: any) {
    const workerUrl =  config.url;

    // Bootstrap service and connect. On failure, try to connect again.
    const workerService = new WorkerService(document.location.origin, workerUrl, config);
    let workerP = workerService.connect("client");
    workerP.catch((error) => {
        console.log(`Error connecting to worker`);
        workerP = workerService.connect("client");
    });
}

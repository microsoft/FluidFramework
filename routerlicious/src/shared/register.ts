import { WorkerService} from ".";

export function registerWorker(config: any) {
    if (!config.onlyServer) {
        const workerUrl =  config.url;

        // Bootstrap service and connect. On failure, try to connect again.
        console.log(`Registering as worker`);
        const workerService = new WorkerService(document.location.origin, workerUrl, config);
        let workerP = workerService.connect("Client");
        workerP.catch((error) => {
            console.log(`Error connecting to worker`);
            workerP = workerService.connect("Client");
        });
    }
}

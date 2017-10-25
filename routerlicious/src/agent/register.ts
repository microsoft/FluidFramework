import { WorkerService } from "./workerService";

export function registerWorker(config: any, clientType: string) {
    if (!config.onlyServer) {
        const workerUrl =  config.url;
        const storageUrl = config.blobStorageUrl;
        const repository = config.repository;

        // Bootstrap service and connect. On failure, try to connect again.
        console.log(`Registering as worker`);
        const workerService = new WorkerService(
            document.location.origin,
            workerUrl,
            storageUrl,
            repository,
            config,
            clientType);
        let workerP = workerService.connect("Client");
        workerP.catch((error) => {
            console.log(`Error connecting to worker`);
            workerP = workerService.connect("Client");
        });
    }
}

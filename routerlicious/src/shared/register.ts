import { WorkerService} from ".";

export function registerWorker(config: string) {
    // Deserialize the config and construct endpoint.
    const workerConfig = JSON.parse(config.replace(/&quot;/g, '"'));
    const workerUrl = document.location.protocol + "//" + document.location.hostname + ":" + workerConfig.port.worker;

    // Bootstrap service and connect.
    const workerService = new WorkerService(document.location.origin, workerUrl, workerConfig);
    workerService.connect("client").catch(() => {
        console.log(`Error initiating worker`);
    });
}

import * as socketStorage from ".";
import * as api from "../api";

// TODO(mdaumi): Fix worker service url.
export function registerAsDefault(url: string) {
    const services: api.ICollaborationServices = {
        deltaNotificationService: new socketStorage.DeltaNotificationService(url),
        deltaStorageService: new socketStorage.DeltaStorageService(url),
        objectStorageService: new socketStorage.ClientObjectStorageService(url),
        workerService: new socketStorage.WorkerService("http://localhost:4000"),
    };

    api.registerDefaultServices(services);
}

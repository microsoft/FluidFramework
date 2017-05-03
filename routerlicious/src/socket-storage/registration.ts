import * as socketStorage from ".";
import * as api from "../api";

export function registerAsDefault(url: string) {
    const services: api.ICollaborationServices = {
        deltaNotificationService: new socketStorage.DeltaNotificationService(url),
        deltaStorageService: new socketStorage.DeltaStorageService(url),
        objectStorageService: new socketStorage.ClientObjectStorageService(url),
    };

    api.registerDefaultServices(services);
}

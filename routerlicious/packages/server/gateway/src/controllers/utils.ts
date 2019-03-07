import * as api from "@prague/client-api";
import * as socketStorage from "@prague/routerlicious-socket-storage";
import { BrowserErrorTrackingService } from "./errorTracking";

export function registerDocumentServices(config: any) {
    const errorService = config.trackError
        ? new BrowserErrorTrackingService()
        : new socketStorage.DefaultErrorTracking();

    const documentServices = socketStorage.createDocumentService(
        config.serverUrl,
        config.blobStorageUrl,
        errorService);
    api.registerDocumentService(documentServices);
}

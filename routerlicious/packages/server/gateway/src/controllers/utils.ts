import * as api from "@prague/client-api";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import { BrowserErrorTrackingService } from "./errorTracking";

export function registerDocumentServiceFactory(config: any) {
    const errorService = config.trackError
        ? new BrowserErrorTrackingService()
        : new DefaultErrorTracking();

    const documentServices = new RouterliciousDocumentServiceFactory(false, errorService);
    api.registerDocumentServiceFactory(documentServices);
}

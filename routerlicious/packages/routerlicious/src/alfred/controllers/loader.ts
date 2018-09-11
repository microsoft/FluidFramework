import { ICommit } from "@prague/gitresources";
import * as loader from "@prague/loader-web";
import { createDocumentService, DefaultErrorTracking, TokenService } from "@prague/socket-storage";
import { BrowserErrorTrackingService } from "./errorTracking";

export async function initialize(id: string, version: ICommit, token: string, config: any) {
    const errorService = config.trackError
        ? new BrowserErrorTrackingService()
        : new DefaultErrorTracking();

    const documentServices = createDocumentService(
        document.location.origin,
        config.blobStorageUrl,
        errorService);

    loader.run(token, null, false, documentServices, new TokenService(), version, true)
        .catch((error) => console.error(error));
}

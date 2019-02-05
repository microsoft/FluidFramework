import { ICommit } from "@prague/gitresources";
import * as loader from "@prague/loader-web";
import { createReplayDocumentService } from "@prague/replay-socket-storage";
import {
    createDocumentService,
    DefaultErrorTracking,
    TokenProvider,
    TokenService,
} from "@prague/socket-storage";
import { BrowserErrorTrackingService } from "./errorTracking";

export async function initialize(
    version: ICommit,
    token: string,
    config: any,
    chaincode: string,
    npm: string,
    from: number,
    to: number,
    unitIsTime: boolean) {

    const errorService = config.trackError
        ? new BrowserErrorTrackingService()
        : new DefaultErrorTracking();

    const replay = from >= 0 || to >= 0;
    const documentServices = replay
        ? createReplayDocumentService(document.location.origin, from, to, unitIsTime)
        : createDocumentService(
            document.location.origin,
            config.blobStorageUrl,
            errorService);

    const tokenService = new TokenService();
    const claims = tokenService.extractClaims(token);

    loader.run(
        claims.documentId,
        claims.tenantId,
        new TokenProvider(token),
        null,
        false,
        documentServices,
        version,
        true,
        chaincode,
        npm)
        .catch((error) => console.error(error));
}

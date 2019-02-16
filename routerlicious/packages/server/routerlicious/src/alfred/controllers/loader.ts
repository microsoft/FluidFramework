import { DataStore } from "@prague/app-datastore";
import { WebLoader } from "@prague/loader-web";
import { createReplayDocumentService } from "@prague/replay-socket-storage";
import {
    createDocumentService,
    DefaultErrorTracking,
} from "@prague/socket-storage";
import { IAlfredUser } from "../utils";
import { BrowserErrorTrackingService } from "./errorTracking";

export async function containerInitialize(
    documentId: string,
    path: string,
    code: string,
    config: any,
    key: string,
    user: IAlfredUser | undefined,
    from: number,
    to: number,
    unitIsTime: boolean,
): Promise<void> {
    const errorService = config.trackError
        ? new BrowserErrorTrackingService()
        : new DefaultErrorTracking();

    const replay = from >= 0 || to >= 0;
    const hostUrl = document.location.origin;
    const documentServices = replay
        ? createReplayDocumentService(hostUrl, from, to, unitIsTime)
        : createDocumentService(
            hostUrl,
            config.blobStorageUrl,
            errorService);

    const userId = user
        ? user.id
        : "anonymous";

    const store = new DataStore(
        hostUrl,
        new WebLoader(config.npm),
        documentServices,
        key,
        config.tenantId,
        userId);

    const componentOut = await store.open(
        documentId,
        code,
        path,
        [["div", Promise.resolve(document.getElementById("content"))]]);

    // The below line is a convenient place to set a breakpoint to interact with headless
    // components in the debugger.
    console.log(`Finished loading ${componentOut.constructor.name}`);
}

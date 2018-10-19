import { IDocumentService } from "@prague/runtime-definitions";
import { SharepointDocumentService } from "./sharepointDocumentService";

export function createSharepointDocumentService(
    snapshotUrl: string,
    deltaFeedUrl: string,
    webSocketUrl: string,
    ): IDocumentService {

    const service = new SharepointDocumentService(
        snapshotUrl,
        deltaFeedUrl,
        webSocketUrl);

    return service;
}

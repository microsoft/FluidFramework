import { IDocumentService } from "@prague/container-definitions";
import { ReplayDocumentService } from "./documentService";

export function createReplayDocumentService(
    deltaUrl: string,
    replayFrom: number,
    replayTo: number,
    unitIsTime?: boolean,
): IDocumentService {

    const service = new ReplayDocumentService(
        deltaUrl, replayFrom, replayTo, unitIsTime);

    return service;
}

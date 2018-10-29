import { IDocumentService } from "@prague/runtime-definitions";
import {ReplayDocumentService} from "./documentService";

export function createReplayDocumentService(
    deltaUrl: string,
    replayFrom: number,
    replayTo: number,
    ): IDocumentService {

    const service = new ReplayDocumentService(
        deltaUrl, replayFrom, replayTo);

    return service;
}

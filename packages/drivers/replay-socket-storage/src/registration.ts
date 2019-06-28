/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService } from "@prague/container-definitions";
import { ReplayDocumentService } from "./documentService";

/**
 * Creates a ReplayDocument Service which can replay ops from --from to --to.
 * @param replayFrom - First op to be replayed is replayFrom + 1.
 * @param replayTo - Last op number to be replayed on socket is replayTo - 1.
 * @param documentService - The document service to be used to get underlying endpoints.
 * @param unitIsTime - True is user want to play ops that are within a replay resolution window.
 * @returns returns the delta stream service which replay ops from --from to --to arguments.
 */
export function createReplayDocumentService(
    replayFrom: number,
    replayTo: number,
    documentService: IDocumentService,
    unitIsTime?: boolean,
): IDocumentService {
    return new ReplayDocumentService(replayFrom, replayTo, documentService, unitIsTime);
}

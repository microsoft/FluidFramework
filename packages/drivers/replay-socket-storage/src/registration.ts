/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService } from "@prague/container-definitions";
import { DebugReplayController } from "./fluidDebugger";
import { IReplayController } from "./replayController";
import { ReplayDocumentService } from "./replayDocumentService";

/**
 * Creates a ReplayDocument Service which can replay ops from --from to --to.
 * @param replayFrom - First op to be replayed is replayFrom + 1.
 * @param replayTo - Last op number to be replayed on socket is replayTo - 1.
 * @param documentService - The document service to be used to get underlying endpoints.
 * @param unitIsTime - True is user want to play ops that are within a replay resolution window.
 * @returns returns the delta stream service which replay ops from --from to --to arguments.
 */
export function createReplayDocumentService(
    documentService: IDocumentService,
    controller: IReplayController,
): IDocumentService {
    return new ReplayDocumentService(documentService, controller);
}

/**
 * Creates document service wrapper that pops up Debugger window and allows user to play ops one by one.
 * User can chose to start with any snapshot, or no snapshot.
 * If pop-ups are disabled, we continue without debugger.
 * @param documentService - original document service to use to fetch ops / snapshots.
 */
export function createDebuggerReplayDocumentService(documentService: IDocumentService): IDocumentService {
    const controller = DebugReplayController.create();
    if (!controller) {
        return documentService;
    }
    return createReplayDocumentService(documentService, controller);
}

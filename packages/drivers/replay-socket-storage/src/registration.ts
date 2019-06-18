/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService } from "@prague/container-definitions";
import { ReplayDocumentService } from "./documentService";

export function createReplayDocumentService(
    replayFrom: number,
    replayTo: number,
    documentService: IDocumentService,
    unitIsTime?: boolean,
): IDocumentService {
    return new ReplayDocumentService(replayFrom, replayTo, documentService, unitIsTime);
}

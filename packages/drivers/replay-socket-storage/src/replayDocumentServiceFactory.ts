/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@prague/container-definitions";
import { createReplayDocumentService } from "./registration";

export class ReplayDocumentServiceFactory implements IDocumentServiceFactory {

    constructor(
        private readonly from: number,
        private readonly to: number,
        private readonly documentServiceFactory: IDocumentServiceFactory) {}

    public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        return Promise.resolve(createReplayDocumentService(
            this.from,
            this.to,
            await this.documentServiceFactory.createDocumentService(resolvedUrl)));
    }
}

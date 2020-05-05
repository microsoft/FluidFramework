/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { ReplayController } from "./replayController";
import { ReplayControllerStatic } from "./replayDocumentDeltaConnection";
import { ReplayDocumentService } from "./replayDocumentService";

export class ReplayDocumentServiceFactory implements IDocumentServiceFactory {
    public static create(
        from: number,
        to: number,
        documentServiceFactory: IDocumentServiceFactory) {
        return new ReplayDocumentServiceFactory(
            documentServiceFactory,
            new ReplayControllerStatic(from, to),
        );
    }

    public readonly protocolName;

    public constructor(
        private readonly documentServiceFactory: IDocumentServiceFactory,
        private readonly controller: ReplayController) {
        this.protocolName = documentServiceFactory.protocolName;
    }

    /**
     * Creates a replay document service which uses the document service of provided
     * documentServiceFactory for connecting to delta stream endpoint.
     * @param resolvedUrl - URL to be used for connecting to endpoints.
     * @returns returns the requested document service
     */
    public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        return Promise.resolve(ReplayDocumentService.create(
            await this.documentServiceFactory.createDocumentService(resolvedUrl),
            this.controller));
    }
}

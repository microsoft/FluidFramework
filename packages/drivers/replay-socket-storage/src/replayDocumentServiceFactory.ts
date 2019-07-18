/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@prague/container-definitions";
import { DebugReplayController } from "./fluidDebugger";
import { createReplayDocumentService } from "./registration";
import { ReplayController } from "./replayController";
import { ReplayControllerStatic } from "./replayDocumentDeltaConnection";

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

    public static createDebugger(
            documentServiceFactory: IDocumentServiceFactory) {
        const controller = DebugReplayController.create();
        if (!controller) {
            return documentServiceFactory;
        }
        return new ReplayDocumentServiceFactory(
            documentServiceFactory,
            controller,
        );
    }

    private constructor(
        private readonly documentServiceFactory: IDocumentServiceFactory,
        private readonly controller: ReplayController) {}

    /**
     * Creates a replay document service which uses the document service of provided
     * documentServiceFactory for connecting to delta stream endpoint.
     * @param resolvedUrl - URL to be used for connecting to endpoints.
     * @returns returns the requested document service
     */
    public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        return Promise.resolve(createReplayDocumentService(
            await this.documentServiceFactory.createDocumentService(resolvedUrl),
            this.controller));
    }
}

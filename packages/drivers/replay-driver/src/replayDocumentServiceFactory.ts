/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@fluidframework/driver-definitions";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
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
    public async createDocumentService(
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        clientIsSummarizer?: boolean,
    ): Promise<IDocumentService> {
        // Always include isReplay: true on events for the Replay Driver.
        // It's used in testing/debugging scenarios, so we want to be able to filter these events out sometimes.
        const replayLogger = ChildLogger.create(
            logger, undefined /* namespace */, {all: { isReplay: true }} /* properties */);

        return ReplayDocumentService.create(
            await this.documentServiceFactory.createDocumentService(resolvedUrl, replayLogger, clientIsSummarizer),
            this.controller);
    }

    // TODO: Issue-2109 Implement detach container api or put appropriate comment.
    public async createContainer(
        createNewSummary: ISummaryTree,
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
        clientIsSummarizer?: boolean,
    ): Promise<IDocumentService> {
        throw new Error("Not implemented");
    }
}

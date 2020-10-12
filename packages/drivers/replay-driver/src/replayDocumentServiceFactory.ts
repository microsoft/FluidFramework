/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@fluidframework/driver-definitions";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { ReplayController } from "./replayController";
import { ReplayControllerStatic } from "./replayDocumentDeltaConnection";
import { ReplayDocumentService } from "./replayDocumentService";

/**
 * Wrapper logger that adds isReplay: true to each event.
 * ReplayDriver is used in testing/debugging scenarios, so we want to be able to filter these events out sometimes
 */
class ReplayDriverTelemetryLogger implements ITelemetryBaseLogger {
    constructor(
        private readonly logger: ITelemetryBaseLogger,
    ) { }

    send(event: ITelemetryBaseEvent): void {
        this.logger.send({ ...event, isReplay: true });
    }
}

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
    ): Promise<IDocumentService> {
        const replayLogger = logger && new ReplayDriverTelemetryLogger(logger);
        return Promise.resolve(ReplayDocumentService.create(
            await this.documentServiceFactory.createDocumentService(resolvedUrl, replayLogger),
            this.controller));
    }

    // TODO: Issue-2109 Implement detach container api or put appropriate comment.
    public async createContainer(
        createNewSummary: ISummaryTree,
        resolvedUrl: IResolvedUrl,
        logger?: ITelemetryBaseLogger,
    ): Promise<IDocumentService> {
        throw new Error("Not implemented");
    }
}

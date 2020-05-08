/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import {
    IDocumentService,
    IDocumentServiceFactory,
    IResolvedUrl,
} from "@microsoft/fluid-driver-definitions";
import { ensureFluidResolvedUrl } from "@microsoft/fluid-driver-utils";
import { ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import { ISummaryTree } from "@microsoft/fluid-protocol-definitions";
import { CreationDocumentService } from "./creationDocumentService";
/**
 * Factory for creating the faux document service. Use this if you want to
 * lie to runtime that there is an actual connection to server.
 */
export class CreationDocumentServiceFactory implements IDocumentServiceFactory {
    public readonly protocolName = "fluid-creation:";
    constructor() {
    }

    public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        ensureFluidResolvedUrl(resolvedUrl);

        const fluidResolvedUrl = resolvedUrl;
        const parsedUrl = parse(fluidResolvedUrl.url);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const [, , documentId] = parsedUrl.pathname!.split("/");
        return new CreationDocumentService(
            documentId,
            "createNewFileDocTenant");
    }

    // TODO: Issue-2109 Implement detach container api or put appropriate comment.
    public async createContainer(
        createNewSummary: ISummaryTree,
        resolvedUrl: IResolvedUrl,
        logger: ITelemetryLogger,
    ): Promise<IDocumentService> {
        throw new Error("Not implemented");
    }
}

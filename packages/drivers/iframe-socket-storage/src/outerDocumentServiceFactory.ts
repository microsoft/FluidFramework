/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IHost } from "@microsoft/fluid-container-definitions";
import {
    ConnectionMode,
    IClient,
    IDocumentService,
    IDocumentServiceFactory,
    IResolvedUrl,
} from "@microsoft/fluid-protocol-definitions";
import { OuterDocumentService } from "./outerDocumentService";

/**
 * A converter that remotes a real connection to documentServices to an iframe
 */
export class OuterDocumentServiceFactory implements IDocumentServiceFactory {
    public readonly protocolName = "fluid-outer:";
    constructor(private readonly documentServiceFactory: IDocumentServiceFactory,
                private readonly frameP: Promise<HTMLIFrameElement>,
                private readonly options: any,
                private readonly containerHost: IHost) {

    }

    public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
        const connectedDocumentService: IDocumentService =
            await this.documentServiceFactory.createDocumentService(resolvedUrl);

        const mode: ConnectionMode = "write";

        const documentServiceP = OuterDocumentService.create(connectedDocumentService, await this.frameP, mode);

        // tslint:disable-next-line: no-unsafe-any
        const clientDetails = this.options ? (this.options.client as IClient) : null;

        documentServiceP
            .then((documentService) => {
                return Promise.all([
                    documentService.connectToDeltaStream(clientDetails!, mode),
                    documentService.connectToDeltaStorage(),
                    documentService.connectToStorage(),
                ]);
            })
            .catch((err) => {
                console.error(err);
            });

        return documentServiceP;
    }

    public async createDocumentServiceFromRequest(request: IRequest): Promise<IDocumentService> {
        return this.createDocumentService(await this.containerHost.resolver.resolve(request));
    }
}

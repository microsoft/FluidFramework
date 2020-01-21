/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentService,
    IDocumentServiceFactory,
    IResolvedUrl,
} from "@microsoft/fluid-driver-definitions";
import { FauxDocumentService } from "./fauxDocumentService";

/**
 * Factory for creating the faux document service. Use this if you want to
 * lie to runtime that there is an actual connection to server.
 */
export class FauxDocumentServiceFactory implements IDocumentServiceFactory {

    public readonly protocolName = "fluid-faux:";
    constructor() {
    }

    public async createDocumentService(url: IResolvedUrl): Promise<IDocumentService> {
        return new FauxDocumentService();
    }
}

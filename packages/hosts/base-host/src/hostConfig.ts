/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentServiceFactory, IUrlResolver } from "@microsoft/fluid-protocol-definitions";

/**
 * Host config that contains a url resolver to resolve the url and then provides a
 * list of document service factories from which one can be selcted based on protocol
 * of resolved url.
 */
export interface IHostConfig {
    documentServiceFactory: IDocumentServiceFactory | IDocumentServiceFactory[];
    urlResolver: IUrlResolver | IUrlResolver[];
}

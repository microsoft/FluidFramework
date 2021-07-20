/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRequest } from "@fluidframework/core-interfaces";
import { IRuntimeFactory } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
export declare function getContainer(documentId: string, createNew: boolean, request: IRequest, urlResolver: IUrlResolver, documentServiceFactory: IDocumentServiceFactory, containerRuntimeFactory: IRuntimeFactory): Promise<Container>;
//# sourceMappingURL=getContainer.d.ts.map
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { IOuterDocumentDeltaConnectionProxy, InnerDocumentDeltaConnection } from "./innerDocumentDeltaConnection";
export { InnerDocumentService } from "./innerDocumentService";
export { InnerDocumentServiceFactory } from "./innerDocumentServiceFactory";
export {
	ICombinedDriver,
	IDocumentServiceFactoryProxy,
	IDocumentServiceFactoryProxyKey,
	DocumentServiceFactoryProxy,
} from "./outerDocumentServiceFactory";
export { InnerUrlResolver } from "./innerUrlResolver";
export { IUrlResolverProxy, IUrlResolverProxyKey, OuterUrlResolver } from "./outerUrlResolver";

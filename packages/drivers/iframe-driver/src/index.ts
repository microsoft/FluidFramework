/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { InnerDocumentDeltaConnection, IOuterDocumentDeltaConnectionProxy } from "./innerDocumentDeltaConnection";
export { InnerDocumentService } from "./innerDocumentService";
export { InnerDocumentServiceFactory } from "./innerDocumentServiceFactory";
export { InnerUrlResolver } from "./innerUrlResolver";
export {
	DocumentServiceFactoryProxy,
	ICombinedDriver,
	IDocumentServiceFactoryProxy,
	IDocumentServiceFactoryProxyKey,
} from "./outerDocumentServiceFactory";
export { IUrlResolverProxy, IUrlResolverProxyKey, OuterUrlResolver } from "./outerUrlResolver";

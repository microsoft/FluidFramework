/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { ITinyliciousRouteOptions, RouteOptions } from "./loader";
export declare const dockerUrls: {
    hostUrl: string;
    ordererUrl: string;
    storageUrl: string;
};
export declare const tinyliciousUrls: (options: ITinyliciousRouteOptions) => {
    hostUrl: string;
    ordererUrl: string;
    storageUrl: string;
};
export declare class MultiUrlResolver implements IUrlResolver {
    private readonly documentId;
    private readonly rawUrl;
    private readonly options;
    private readonly useLocalResolver;
    private readonly urlResolver;
    constructor(documentId: string, rawUrl: string, options: RouteOptions, useLocalResolver?: boolean);
    getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string>;
    resolve(request: IRequest): Promise<IResolvedUrl | undefined>;
    createRequestForCreateNew(fileName: string): Promise<IRequest>;
}
//# sourceMappingURL=multiResolver.d.ts.map
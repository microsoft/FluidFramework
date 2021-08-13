/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRequest } from "@fluidframework/core-interfaces";
import { IUrlResolver, IFluidResolvedUrl, IResolvedUrl } from "@fluidframework/driver-definitions";
import { ITokenProvider } from "@fluidframework/routerlicious-driver";
export declare class FrsUrlResolver implements IUrlResolver {
    private readonly tenantId;
    private readonly orderer;
    private readonly storage;
    private readonly documentId;
    private readonly tokenProvider;
    constructor(tenantId: string, orderer: string, storage: string, documentId: string, tokenProvider: ITokenProvider);
    resolve(request: IRequest): Promise<IFluidResolvedUrl>;
    getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string>;
}
//# sourceMappingURL=FrsUrlResolver.d.ts.map
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
import { FrsMember } from "./interfaces";
export declare class FrsAzFunctionTokenProvider implements ITokenProvider {
    private readonly azFunctionUrl;
    private readonly user?;
    constructor(azFunctionUrl: string, user?: Pick<FrsMember<any>, "userId" | "userName" | "additionalDetails"> | undefined);
    fetchOrdererToken(tenantId: string, documentId: string): Promise<ITokenResponse>;
    fetchStorageToken(tenantId: string, documentId: string): Promise<ITokenResponse>;
    private getToken;
}
//# sourceMappingURL=FrsAzFunctionTokenProvider.d.ts.map
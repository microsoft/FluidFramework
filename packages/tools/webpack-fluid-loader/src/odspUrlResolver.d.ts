/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRequest } from "@fluidframework/core-interfaces";
import { IUrlResolver, IResolvedUrl } from "@fluidframework/driver-definitions";
import { IOdspAuthRequestInfo } from "@fluidframework/odsp-doclib-utils";
export declare class OdspUrlResolver implements IUrlResolver {
    private readonly server;
    private readonly authRequestInfo;
    private readonly driverUrlResolver;
    constructor(server: string, authRequestInfo: IOdspAuthRequestInfo);
    resolve(request: IRequest): Promise<IResolvedUrl>;
    private formFilePath;
    getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string>;
    createCreateNewRequest(fileName: string): Promise<IRequest>;
}
//# sourceMappingURL=odspUrlResolver.d.ts.map
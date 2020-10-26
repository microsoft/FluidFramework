/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IOdspAuthRequestInfo } from "./odspAuth";
export declare function getAsync(url: string, authRequestInfo: IOdspAuthRequestInfo): Promise<Response>;
export declare function putAsync(url: string, authRequestInfo: IOdspAuthRequestInfo): Promise<Response>;
export declare function postAsync(url: string, body: any, authRequestInfo: IOdspAuthRequestInfo): Promise<Response>;
export declare function unauthPostAsync(url: string, body: any): Promise<Response>;
//# sourceMappingURL=odspRequest.d.ts.map
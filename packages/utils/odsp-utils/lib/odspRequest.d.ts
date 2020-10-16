/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IOdspAuthRequestInfo } from "./odspAuth";
export interface IRequestResult {
    href: string | undefined;
    status: number;
    data: any;
}
export declare type RequestResultError = Error & {
    requestResult?: IRequestResult;
};
export declare function getAsync(url: string, authRequestInfo: IOdspAuthRequestInfo): Promise<IRequestResult>;
export declare function putAsync(url: string, authRequestInfo: IOdspAuthRequestInfo): Promise<IRequestResult>;
export declare function postAsync(url: string, body: any, authRequestInfo: IOdspAuthRequestInfo): Promise<IRequestResult>;
export declare function unauthPostAsync(url: string, body: any): Promise<IRequestResult>;
export declare function createErrorFromResponse(message: string, requestResult: IRequestResult): RequestResultError;
//# sourceMappingURL=odspRequest.d.ts.map
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRequest } from "@microsoft/fluid-component-core-interfaces";

/**
 * The Request Parser takes an IRequest provides parsing and sub request creation
 */
export class RequestParser implements IRequest {
    private requestPathParts: string[] | undefined;
    private readonly queryStartIndex: number;
    constructor(private readonly request: Readonly<IRequest>) {
        this.queryStartIndex = this.request.url.indexOf("?");
    }

    public get url(): string {
        return this.request.url;
    }

    public get headers() {
        return this.request.headers;
    }

    public get pathParts(): ReadonlyArray<string> {
        if (this.requestPathParts === undefined) {
            this.requestPathParts = this.request.url
                .substring(this.queryStartIndex < 0 ? 0 : this.queryStartIndex)
                .split("/")
                .reduce<string[]>(
                (pv, cv) => {
                    if (cv !== undefined && cv.length > 0) {
                        pv.push(cv);
                    }
                    return pv;
                },
                []);
        }
        return this.requestPathParts;
    }

    public createSubRequest(startingPathIndex: number): IRequest {
        const query = this.queryStartIndex < 0 ? "" : this.url.slice(this.queryStartIndex);
        return {
            url: this.pathParts.slice(startingPathIndex).join("/") + query,
            headers: this.headers,
        };
    }
}

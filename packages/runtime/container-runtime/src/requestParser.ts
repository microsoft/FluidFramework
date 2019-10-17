/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRequest } from "@microsoft/fluid-component-core-interfaces";

/**
 * The Request Parser takes an IRequest provides parsing and sub request creation
 */
export class RequestParser implements IRequest {

    /**
     * Splits the path of the url and decodes each path part
     * @param url - the url to get path parts of
     */
    public static getPathParts(url: string): ReadonlyArray<string> {
        const queryStartIndex = url.indexOf("?");
        return url
            .substring(queryStartIndex < 0 ? 0 : queryStartIndex)
            .split("/")
            .reduce<string[]>(
            (pv, cv) => {
                if (cv !== undefined && cv.length > 0) {
                    pv.push(decodeURIComponent(cv));
                }
                return pv;
            },
            []);
    }

    private requestPathParts: ReadonlyArray<string> | undefined;
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

    /**
     * Returns the decoded path parts of the request's url
     */
    public get pathParts(): ReadonlyArray<string> {
        if (this.requestPathParts === undefined) {
            this.requestPathParts = RequestParser.getPathParts(this.url);
        }
        return this.requestPathParts;
    }

    /**
     * Creates a sub request starting at a specific path part of this request's url
     *
     * @param startingPathIndex - The index of the first path part of the sub request
     */
    public createSubRequest(startingPathIndex: number): IRequest {
        const query = this.queryStartIndex < 0 ? "" : this.url.slice(this.queryStartIndex);
        return {
            url: this.pathParts.slice(startingPathIndex).join("/") + query,
            headers: this.headers,
        };
    }
}

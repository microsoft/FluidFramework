/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRequest } from "@fluidframework/component-core-interfaces";

/**
 * The Request Parser takes an IRequest provides parsing and sub request creation
 */
export class RequestParser implements IRequest {
    /**
     * Splits the path of the url and decodes each path part
     * @param url - the url to get path parts of
     */
    public static getPathParts(url: string): readonly string[] {
        const queryStartIndex = url.indexOf("?");
        return url
            .substring(0, queryStartIndex < 0 ? url.length : queryStartIndex)
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

    private requestPathParts: readonly string[] | undefined;
    public readonly query: string;
    constructor(private readonly request: Readonly<IRequest>) {
        const queryStartIndex = this.request.url.indexOf("?");
        if (queryStartIndex >= 0) {
            this.query = this.request.url.substring(queryStartIndex);
        } else {
            this.query = "";
        }
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
    public get pathParts(): readonly string[] {
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
    public createSubRequest(startingPathIndex: number): IRequest | undefined {
        if (startingPathIndex < 0 || startingPathIndex > this.pathParts.length) {
            return undefined;
        }
        const path = this.pathParts.slice(startingPathIndex).join("/");
        return {
            url: path + this.query,
            headers: this.headers,
        };
    }
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRequest, IRequestHeader } from "@fluidframework/core-interfaces";

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

    public static create(request: Readonly<IRequest>) {
        // Perf optimizations.
        if (request instanceof RequestParser) {
            return request;
        }
        return new RequestParser(request);
    }

    protected constructor(private readonly request: Readonly<IRequest>) {
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

    public get headers(): IRequestHeader | undefined {
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
     * Returns true if it's a terminating path, i.e. no more elements after `elements` entries and empty query.
     * @param elements - number of elements in path
     */
    public isLeaf(elements: number) {
        return this.query === "" && this.pathParts.length === elements;
    }

    /**
     * Creates a sub request starting at a specific path part of this request's url
     * The sub request url always has a leading slash, and always include query params if original url has any
     * e.g. original url is /a/b/?queryParams, createSubRequest(0) is /a/b/?queryParams
     * createSubRequest(1) is /b/?queryParams
     * createSubRequest(2) is /?queryParams
     * createSubRequest(n) where n is bigger than parts length, e.g. 2, or n is less than 0 will throw an exception
     *
     * note: query params are not counted towards path parts.
     *
     * @param startingPathIndex - The index of the first path part of the sub request
     */
    public createSubRequest(startingPathIndex: number): IRequest {
        const pathLen = this.pathParts.length;
        if (startingPathIndex < 0 || startingPathIndex > pathLen) {
            throw new Error("incorrect sub-request");
        }
        if (startingPathIndex === pathLen && this.url.includes("?")) {
            return {
                url:`/${this.query}`,
                headers: this.headers,
            };
        }
        const path = `/${this.pathParts.slice(startingPathIndex).join("/")}`;
        return {
            url: this.query === "" ? path : `${path}/${this.query}`,
            headers: this.headers,
        };
    }
}

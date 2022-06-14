/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IncomingMessage } from "http";
import qs from "querystring";
import { NetworkError, RestLessFieldNames } from "@fluidframework/server-services-client";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import inclusion = require("inclusion");

export const decodeHeader = (
    header: string,
): { name: string; value: string; } => {
    const [name, value] = header.split(/: (.+)/);
    return { name, value };
};

type IncomingMessageEx = IncomingMessage & { body?: any; };

/**
 * Server for communicating with a "RestLess" client.
 * Translates a "RestLess" HTTP request into a typical RESTful HTTP format
 */
export class RestLessServer {
    /**
     * If POST request has content-type application/x-www-urlencoded,
     * translates request from RestLess to standard REST in-place.
     */
    public async translate(
        request: IncomingMessageEx,
    ): Promise<IncomingMessageEx> {
        // Ensure it's intended to be RestLess
        if (!RestLessServer.isRestLess(request)) {
            return request;
        }
        // It is possible that body-parser.urlencoded has already parsed the body
        if (typeof request.body === "object") {
            this.translateRequestFields(request, request.body);
            this.parseRequestBody(request);
        } else if (!request.complete) {
            await this.parseStreamRequestFormBody(request);
        }
        return request;
    }

    private translateRequestFields(request: IncomingMessageEx, fields: Record<string, any>): void {
        // Parse and override HTTP Method
        const methodOverrideField = fields[
            RestLessFieldNames.Method
        ] as string[] | string;
        if (methodOverrideField instanceof Array) {
            request.method = methodOverrideField[0];
        } else {
            request.method = methodOverrideField;
        }
        // Parse and add HTTP Headers
        const headerField: string | string[] = fields[RestLessFieldNames.Header];
        let definedNewContentType: boolean = false;
        const parseAndSetHeader = (header: string) => {
            const { name, value } = decodeHeader(header);
            if (name.toLowerCase() === "content-type") {
                definedNewContentType = true;
            }
            request.headers[name] = value;
            request.headers[name.toLowerCase()] = value;
        };
        if (headerField instanceof Array) {
            headerField.forEach(parseAndSetHeader);
        } else if (typeof headerField === "string") {
            parseAndSetHeader(headerField);
        }
        if (!definedNewContentType) {
            // If no new content type was defined, assume it is JSON parseable.
            // Otherwise, we will parse by content-type.
            request.headers["content-type"] = "application/json";
        }
        // Parse and replace request body
        const bodyField: string[] | string = fields[RestLessFieldNames.Body];
        // Tell body-parser middleware not to parse the body
        (request as any)._body = true;
        if (bodyField instanceof Array) {
            request.body = bodyField[0];
        } else {
            request.body = bodyField;
        }
    }

    private parseRequestBody(request: IncomingMessageEx): void {
        if (request.body) {
            // TODO: not as robust as body-parser middleware,
            // but body-parser only compatible with request streams, and req stream is exhausted by now
            const contentType = request.headers["content-type"]?.toLowerCase();
            if (contentType.includes("application/json")) {
                try {
                    request.body = JSON.parse(request.body);
                } catch (e) {
                    throw new NetworkError(400, "Failed to parse json body");
                }
            } else if (contentType.includes("application/x-www-form-urlencoded")) {
                try {
                    request.body = qs.parse(request.body);
                } catch (e) {
                    throw new NetworkError(400, "Failed to parse urlencoded body");
                }
            }
        }
    }

    private async parseStreamRequestFormBody(request: IncomingMessageEx): Promise<void> {
        const formidable = (await inclusion("formidable")).default;
        return new Promise<void>((resolve, reject) => {
            const form = formidable();

            form.parse(request, (err, fields) => {
                if (err) {
                    reject(err);
                    return;
                }
                this.translateRequestFields(request, fields);
                this.parseRequestBody(request);
                resolve();
            });
        });
    }

    private static isRestLess(request: IncomingMessageEx) {
        const isPost = request.method?.toLowerCase() === "post";
        const contentTypeContents: string[] | undefined = request.headers["content-type"]?.toLowerCase()?.split(";");
        // TODO: maybe add multipart/form-data support in future if needed for blob uploads
        const isForm = contentTypeContents?.includes("application/x-www-form-urlencoded");
        const isRestLess = contentTypeContents?.includes("restless");
        return isPost && isForm && isRestLess;
    }
}

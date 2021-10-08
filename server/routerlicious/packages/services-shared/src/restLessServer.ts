/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IncomingMessage } from "http";
import qs from "querystring";
import { NetworkError, RestLessFieldNames } from "@fluidframework/server-services-client";
import formidable from "formidable";

export const decodeHeader = (
    header: string,
): { name: string; value: string } => {
    const [name, value] = header.split(/: (.+)/);
    return { name, value };
};

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
        request: IncomingMessage & { body?: any },
    ): Promise<IncomingMessage & { body?: any }> {
        // ensure it's possibly intended to be for RestLess
        if (request.method?.toLowerCase() !== "post") {
            return request;
        }
        const translateRequestFields = (fields: Record<string, any>): void => {
            // Parse and override HTTP Method
            const methodOverride = fields[
                RestLessFieldNames.Method
            ] as string;
            request.method = methodOverride;
            // Parse and add HTTP Headers
            const headerField = fields[RestLessFieldNames.Header];
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
            // Parse and replace request body
            const bodyField = fields[RestLessFieldNames.Body];
            // Tell body-parser middleware not to parse the body
            (request as any)._body = true;
            request.body = bodyField;
            if (request.body) {
                // If no new content type was defined, assume it is JSON parseable. Otherwise, parse by content-type.
                // TODO: not as robust as body-parser middleware,
                // but body-parser only compatible with request streams, and req stream is exhausted by now
                const contentType = request.headers["content-type"]?.toLowerCase();
                if (!definedNewContentType || contentType.includes("application/json")) {
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
        };
        const parseStreamRequestFormBody = async () => new Promise<void>((resolve, reject) => {
            const form = formidable({ multiples: true });

            form.parse(request, (err, fields) => {
                if (err) {
                    reject(err);
                    return;
                }
                translateRequestFields(fields);
                resolve();
            });
        });
        // TODO: when we support blob/file uploads, we should potentially add compatibility with multipart/form-data
        // Parse and translate only if content-type is application/x-www-form-urlencoded
        if (request.headers["content-type"]?.toLowerCase().includes("application/x-www-form-urlencoded")) {
            // It is possible that body-parser.urlencoded has already parsed the body
            if (typeof request.body === "object") {
                translateRequestFields(request.body);
            } else if (!request.complete) {
                await parseStreamRequestFormBody();
            }
        }
        return request;
    }
}

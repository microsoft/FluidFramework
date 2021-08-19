/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AxiosRequestConfig } from "axios";

export enum RestLessFieldNames {
    Method = "method",
    Header = "header",
    Body = "body",
}

const encodeHeader = (
    headerKey: string,
    headerValue: string,
): string => {
    return `${headerKey}: ${headerValue}`;
};

/**
 * Client for communicating with a "RestLess" server.
 * Translates a typical RESTful HTTP request into "RestLess" HTTP format:
 *
 * POST <path> HTTP/<1.1|2>
 * HOST <hostname>
 * Content-Type: application/x-www-form-urlencoded
 * Content-Length: <length>
 *
 * <url-encoded-headers-body-and-method>
 */
export class RestLessClient {
    /**
     * Translates request from REST to "RestLess" out-of-place.
     */
    public translate(request: AxiosRequestConfig): AxiosRequestConfig {
        const newRequest = { ...request };
        const body = new URLSearchParams();

        body.append(RestLessFieldNames.Method, newRequest.method ?? "GET");

        if (newRequest.headers) {
            for (const [headerKey, headerValue] of Object.entries(
                newRequest.headers as Record<string, string>,
            )) {
                const encodedHeader = encodeHeader(headerKey, headerValue);
                body.append(RestLessFieldNames.Header, encodedHeader);
            }
        }

        if (newRequest.data && ["post", "put", "patch"].includes(newRequest.method?.toLowerCase())) {
            const stringifiedBody = JSON.stringify(newRequest.data);
            body.append(RestLessFieldNames.Body, stringifiedBody);
        }

        newRequest.data = body.toString();
        newRequest.method = "POST";
        newRequest.headers = {
            // TODO: when we support blob/file uploads, we should potentially add compatibility with multipart/form-data
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": body.toString().length,
        };

        return newRequest;
    }
}

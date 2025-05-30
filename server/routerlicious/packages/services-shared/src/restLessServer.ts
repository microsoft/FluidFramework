/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IncomingMessage, ServerResponse } from "http";

import { NetworkError, RestLessFieldNames } from "@fluidframework/server-services-client";
import { urlencoded } from "body-parser";

/**
 * @internal
 */
export const decodeHeader = (header: string): { name: string; value: string } => {
	const [name, value] = header.split(/: (.+)/);
	return { name, value };
};

type IncomingMessageEx = IncomingMessage & { body?: any };
type RequestField = undefined | string | string[];

interface IRestLessServerOptions {
	/**
	 * Request body size limit in number of bytes or as a string to
	 * be passed to the [bytes](https://www.npmjs.com/package/bytes) library.
	 * Only verified when parsing request body as a stream.
	 * Default: 1gb
	 */
	requestSizeLimit: number | string;
}

const defaultRestLessServerOptions: IRestLessServerOptions = {
	requestSizeLimit: "1gb",
};

/**
 * Server for communicating with a "RestLess" client.
 * Translates a "RestLess" HTTP request into a typical RESTful HTTP format
 * @internal
 */
export class RestLessServer {
	private readonly options: IRestLessServerOptions;

	constructor(options?: Partial<IRestLessServerOptions>) {
		this.options = {
			...defaultRestLessServerOptions,
			...options,
		};
	}

	/**
	 * If POST request has content-type application/x-www-urlencoded,
	 * translates request from RestLess to standard REST in-place.
	 */
	public async translate(
		request: IncomingMessageEx,
		response: ServerResponse,
	): Promise<IncomingMessageEx> {
		// Ensure it's intended to be RestLess
		if (!RestLessServer.isRestLess(request)) {
			return request;
		}
		// It is possible that body-parser.urlencoded has already parsed the body
		// If not, we must parse it ourselves.
		if (!request.complete) {
			await new Promise<void>((resolve, reject) =>
				urlencoded({
					limit: this.options.requestSizeLimit,
					extended: true,
					// urlencoded does not recognize content-type: application/x-www-form-urlencoded;restless
					type: (req) =>
						req.headers["content-type"]?.startsWith(
							"application/x-www-form-urlencoded",
						),
				})(request, response, () => resolve()),
			);
		}
		if (!request.body || typeof request.body !== "object") {
			throw new Error("Could not parse RestLess request body");
		}
		this.translateRequestFields(request, request.body);
		this.parseRequestBody(request);
		return request;
	}

	private translateRequestFields(request: IncomingMessageEx, fields: Record<string, any>): void {
		// Parse and override HTTP Method
		const methodOverrideField: RequestField = fields[RestLessFieldNames.Method];
		if (!methodOverrideField) {
			throw new NetworkError(400, "Invalid RestLess Method Property");
		}
		request.method =
			methodOverrideField instanceof Array ? methodOverrideField[0] : methodOverrideField;
		// Parse and add HTTP Headers
		const headerField: RequestField = fields[RestLessFieldNames.Header];
		let definedNewContentType: boolean = false;
		const parseAndSetHeader = (header: string) => {
			const { name, value } = decodeHeader(header);
			if (!name || value === undefined) {
				return;
			}
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
		const bodyField: RequestField = fields[RestLessFieldNames.Body];
		// Tell body-parser middleware not to parse the body
		(request as any)._body = true;
		request.body = bodyField instanceof Array ? bodyField[0] : bodyField;
		request.headers["content-length"] = request.body
			? `${(request.body as string).length}`
			: undefined;
	}

	private parseRequestBody(request: IncomingMessageEx): void {
		if (request.body) {
			// TODO: not as robust as body-parser middleware,
			// but body-parser only compatible with request streams, and req stream is exhausted by now
			const contentType = request.headers["content-type"]?.toLowerCase();
			if (contentType?.includes("application/json")) {
				try {
					request.body = JSON.parse(request.body);
				} catch (e) {
					throw new NetworkError(400, "Failed to parse json body");
				}
			} else if (contentType?.includes("application/x-www-form-urlencoded")) {
				try {
					const searchParamsParsedBody = new URLSearchParams(request.body);
					request.body = Object.fromEntries(searchParamsParsedBody.entries());
				} catch (e) {
					throw new NetworkError(400, "Failed to parse urlencoded body");
				}
			}
		}
	}

	private static isRestLess(request: IncomingMessageEx) {
		const isPost = request.method?.toLowerCase() === "post";
		const contentTypeContents: string[] | undefined = request.headers["content-type"]
			?.toLowerCase()
			?.split(";");
		// TODO: maybe add multipart/form-data support in future if needed for blob uploads
		const isForm = contentTypeContents?.includes("application/x-www-form-urlencoded");
		const isRestLess = contentTypeContents?.includes("restless");
		return isPost && isForm && isRestLess;
	}
}

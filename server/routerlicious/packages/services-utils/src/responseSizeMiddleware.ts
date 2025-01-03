/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "@fluidframework/server-services-telemetry";
import type { RequestHandler } from "express";

export class ResponseSizeMiddleware {
	constructor(private readonly maxResponseSizeInMegaBytes: number) {}

	public validateResponseSize(): RequestHandler {
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		return async (req, res, next) => {
			const originalSend = res.send;
			res.send = (body) => {
				let responseSize: number;
				try {
					responseSize = Buffer.byteLength(
						typeof body === "string" ? body : JSON.stringify(body),
					);
				} catch (error) {
					Lumberjack.error("Invalid JSON string in response body");
					return res.status(500).json({
						error: "Invalid JSON",
						message: "Response body is not a valid JSON string",
					});
				}

				if (responseSize > this.maxResponseSizeInMegaBytes * 1024 * 1024) {
					Lumberjack.error(
						`Response size of ${responseSize} bytes, exceeds the maximum allowed size of ${this.maxResponseSizeInMegaBytes} megabytes`,
					);
					return res.status(413).json({
						error: "Response too large",
						message: `Response size exceeds the maximum allowed size of ${this.maxResponseSizeInMegaBytes} megabytes`,
					});
				}
				return originalSend.call(res, body);
			};
			next();
		};
	}
}

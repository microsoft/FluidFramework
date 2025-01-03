/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import express from "express";
import request from "supertest";
import { ResponseSizeMiddleware } from "../responseSizeMiddleware";

describe("Throttler Middleware", () => {
	const endpoint = "/test";
	const route = `${endpoint}/:id?`;
	let responseSizeMiddleware: ResponseSizeMiddleware;
	const responseMaxSizeInMb = 1; // 1MB
	let app: express.Application;
	let supertest: request.SuperTest<request.Test>;
	const setUpRoute = (data: any, subPath?: string): void => {
		const routePath = `${route}${subPath ? `/${subPath}` : ""}`;
		app.get(routePath, (req, res) => {
			res.status(200).send(data);
		});
	};
	beforeEach(() => {
		app = express();
		responseSizeMiddleware = new ResponseSizeMiddleware(responseMaxSizeInMb);
		app.use(responseSizeMiddleware.validateResponseSize());
	});

	describe("validateResponseSize", () => {
		it("sends 200 when limit not exceeded", async () => {
			setUpRoute("test");
			supertest = request(app);
			await supertest.get(endpoint).expect((res) => {
				assert.strictEqual(res.status, 200);
			});
		});

		it("sends 413 with message when response size is greate than max response size", async () => {
			const sizeInBytes = 5 * 1024 * 1024; // 5MB
			const largeObject = {
				data: "a".repeat(sizeInBytes),
			};
			setUpRoute(largeObject);
			supertest = request(app);
			await supertest.get(endpoint).expect((res) => {
				assert.strictEqual(res.status, 413);
				assert.strictEqual(res.body.error, "Response too large");
				assert.strictEqual(
					res.body.message,
					`Response size exceeds the maximum allowed size of ${responseMaxSizeInMb} megabytes`,
				);
			});
		});
	});
});

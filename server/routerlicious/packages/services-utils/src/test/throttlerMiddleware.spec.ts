/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import express from "express";
import request from "supertest";
import { IThrottler } from "@fluidframework/server-services-core";
import { TestThrottler } from "@fluidframework/server-test-utils";
import { throttle, IThrottleMiddlewareOptions } from "../throttlerMiddleware";

describe("Throttler Middleware", () => {
    const limit = 10;
    const endpoint = "/test";
    const route = `${endpoint}/:id?`;
    let app: express.Application;
    let mockThrottler: IThrottler;
    let supertest: request.SuperTest<request.Test>;
    const setUpThrottledRoute = (throttleOptions?: Partial<IThrottleMiddlewareOptions>, subPath?: string, duration?: number): void => {
        const routePath = `${route}${subPath ? `/${subPath}` : ""}`;
        app.get(routePath, throttle(mockThrottler, undefined, throttleOptions), (req, res) => {
            if (duration) {
                setTimeout(() => res.sendStatus(200), duration);
            } else {
                res.sendStatus(200);
            }
        });
    }
    beforeEach(() => {
        app = express();
        mockThrottler = new TestThrottler(limit);
    });

    describe("throttle", () => {
        it("sends 200 when limit not exceeded", async () => {
            setUpThrottledRoute();
            supertest = request(app);
            for (let i = 0; i < limit; i++) {
                await supertest
                    .get(endpoint)
                    .expect(200);
            }
        });

        it("sends 429 with message and retryAfter when limit exceeded", async () => {
            setUpThrottledRoute();
            supertest = request(app);
            for (let i = 0; i < limit; i++) {
                await supertest
                    .get(endpoint)
                    .expect(200);
            }
            const response = await supertest
                .get(endpoint)
                .expect(429);
            assert.strictEqual(response.body.retryAfter, 1);
            assert.strictEqual(response.body.message, "throttled");
        });

        it("separately throttles multiple throttle id prefixes with same suffix", async () => {
            setUpThrottledRoute({ throttleIdPrefix: "prefix1", throttleIdSuffix: "suffix" }, "1");
            setUpThrottledRoute({ throttleIdPrefix: "prefix2", throttleIdSuffix: "suffix" }, "2");
            supertest = request(app);
            for (let i = 0; i < limit; i++) {
                await supertest
                    .get(`${endpoint}/1`)
                    .expect(200);
                await supertest
                    .get(`${endpoint}/2`)
                    .expect(200);
            }
            const response1 = await supertest
                .get(`${endpoint}/1`)
                .expect(429);
            assert.strictEqual(response1.body.retryAfter, 1);
            assert.strictEqual(response1.body.message, "throttled");

            const response2 = await supertest
                .get(`${endpoint}/2`)
                .expect(429);
            assert.strictEqual(response2.body.retryAfter, 1);
            assert.strictEqual(response2.body.message, "throttled");
        });

        it("separately throttles multiple throttle id suffixes with same prefix", async () => {
            setUpThrottledRoute({ throttleIdPrefix: "prefix", throttleIdSuffix: "suffix1" }, "1");
            setUpThrottledRoute({ throttleIdPrefix: "prefix", throttleIdSuffix: "suffix2" }, "2");
            supertest = request(app);
            for (let i = 0; i < limit; i++) {
                await supertest
                    .get(`${endpoint}/1`)
                    .expect(200);
                await supertest
                    .get(`${endpoint}/2`)
                    .expect(200);
            }
            const response1 = await supertest
                .get(`${endpoint}/1`)
                .expect(429);
            assert.strictEqual(response1.body.retryAfter, 1);
            assert.strictEqual(response1.body.message, "throttled");

            const response2 = await supertest
                .get(`${endpoint}/2`)
                .expect(429);
            assert.strictEqual(response2.body.retryAfter, 1);
            assert.strictEqual(response2.body.message, "throttled");
        });

        it("separately throttles multiple throttle id prefixes parsed from request params", async () => {
            setUpThrottledRoute({ throttleIdPrefix: (req) => req.params.id });
            supertest = request(app);
            for (let i = 0; i < limit; i++) {
                await supertest
                    .get(`${endpoint}/1`)
                    .expect(200);
                await supertest
                    .get(`${endpoint}/2`)
                    .expect(200);
            }
            const response1 = await supertest
                .get(`${endpoint}/1`)
                .expect(429);
            assert.strictEqual(response1.body.retryAfter, 1);
            assert.strictEqual(response1.body.message, "throttled");

            const response2 = await supertest
                .get(`${endpoint}/2`)
                .expect(429);
            assert.strictEqual(response2.body.retryAfter, 1);
            assert.strictEqual(response2.body.message, "throttled");
        });
    });
});

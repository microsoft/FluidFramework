/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import express from "express";
import request from "supertest";
import { IThrottler, ThrottlingError } from "@fluidframework/server-services-core";
import { throttle, IThrottleMiddlewareOptions } from "../throttlerMiddleware";

/**
 * Throttles if an id's count exceeds limit. Exposes tracked `throttleCounts` for easy assertions.
 */
class MockThrottler implements IThrottler {
    public readonly throttleCounts: { [key: string]: number } = {};

    constructor(private readonly limit?: number) {}

    public incrementCount(id: string, weight: number = 1): void {
        if (!this.throttleCounts[id]) {
            this.throttleCounts[id] = 0;
        }
        this.throttleCounts[id] += weight;

        if (this.limit && this.throttleCounts[id] > this.limit) {
            throw new ThrottlingError("throttled", this.throttleCounts[id] - this.limit);
        }
    }

    public decrementCount(id: string, weight: number = 1): void {
        if (!this.throttleCounts[id]) {
            this.throttleCounts[id] = 0;
        }
        this.throttleCounts[id] -= weight;
    }
}

describe("Throttler Middleware", () => {
    const limit = 10;
    const endpoint = "/test";
    let mockThrottler: IThrottler;
    const setUpThrottledApp = (throttleOptions?: IThrottleMiddlewareOptions): request.SuperTest<request.Test> => {
        const app = express();
        app.get(endpoint, throttle(mockThrottler, undefined, throttleOptions), (req, res) => {
            res.status(200).send("OK");
        });
        return request(app);
    }
    beforeEach(() => {
        mockThrottler = new MockThrottler(limit);
    });

    describe("throttle", () => {
        it("sends 200 when limit not exceeded", async () => {
            const supertest = setUpThrottledApp();
            for (let i = 0; i < limit; i++) {
                await supertest
                    .get(endpoint)
                    .expect(200);
            }
        });

        it("sends 429 with message and retryAfter when limit exceeded", async () => {
            const supertest = setUpThrottledApp();
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

        it("increments separate counts for multiple throttle id prefixes with same suffix", async () => {});

        it("increments separate counts for multiple throttle id suffixes with same prefix", async () => {});

        it("increments count for throttle id when prefix is parsed from request params", async () => {});

        it("increments separate counts for multiple throttle id prefixes parsed from request params", async () => {});

        it("decrements count when requests finish", async () => {});
    });
});

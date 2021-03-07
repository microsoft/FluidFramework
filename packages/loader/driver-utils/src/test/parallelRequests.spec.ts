/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { ParallelRequests } from "../parallelRequests";

describe("Parallel Requests", () => {
    async function test(
        concurrency: number,
        payloadSize: number,
        from: number,
        to: number,
        expectedRequests: number,
        knownTo: boolean,
        partial = false)
    {
        let nextElement = from;
        let requests = 0;
        let dispatches = 0;

        const manager = new ParallelRequests<number>(
            from,
            knownTo ? to : undefined,
            payloadSize,
            new TelemetryNullLogger(),
            async (request: number, _from: number, _to: number) => {
                let length = _to - _from;
                requests++;

                assert(_from >= from);
                assert(length <= payloadSize);
                assert(requests <= request);
                assert(!knownTo || _to <= to);

                if (partial) {
                    length = Math.min(length, payloadSize / 2 + 1);
                }
                // covering knownTo === false case
                const actualTo = Math.min(_from + length, to);

                const payload: number[] = [];
                for (let i = _from; i < actualTo; i++) {
                    payload.push(i);
                }

                return { partial: _from === to ? false : partial, cancel: false, payload};
            },
            (deltas: number[]) => {
                dispatches++;
                assert(dispatches <= requests);
                for (const el of deltas) {
                    assert(el === nextElement);
                    nextElement++;
                }
            },
        );

        await manager.run(concurrency);

        assert(nextElement === to);
        assert(dispatches <= requests);
        assert(!knownTo || dispatches === requests);
        assert(requests === expectedRequests);
    }

    async function testCancel(
        from: number,
        to: number | undefined,
        cancelAt: number,
        payloadSize,
        expectedRequests: number)
    {
        let nextElement = from;
        let requests = 0;
        let dispatches = 0;

        const manager = new ParallelRequests<number>(
            from,
            to,
            payloadSize,
            new TelemetryNullLogger(),
            async (request: number, _from: number, _to: number) => {
                const length = _to - _from;
                requests++;

                assert(_from >= from);
                assert(length <= payloadSize);
                assert(requests <= request);
                assert(to === undefined || _to <= to);

                if (_to > cancelAt) {
                    return { partial: false, cancel: true, payload: []};
                }

                const payload: number[] = [];
                for (let i = _from; i < _to; i++) {
                    payload.push(i);
                }

                return { partial: false, cancel: false, payload};
            },
            (deltas: number[]) => {
                dispatches++;
                assert(dispatches <= requests);
                for (const el of deltas) {
                    assert(el === nextElement);
                    nextElement++;
                }
            },
        );

        await manager.run(10);

        assert(dispatches <= requests);
        assert(requests === expectedRequests);
    }

    it("no concurrency, single request, over", async () => {
        await test(1, 100, 123, 156, 1, true);
        await test(1, 100, 123, 156, 1, false);
        await test(1, 100, 123, 156, 1, true, true);
    });

    it("no concurrency, single request, exact", async () => {
        await test(1, 156 - 123, 123, 156, 1, true);
        await test(1, 156 - 123, 123, 156, 2, false);
        await test(1, 156 - 123, 123, 156, 2, true, true);
        await test(1, 156 - 123, 123, 156, 3, false, true);
    });

    it("concurrency, single request, exact", async () => {
        await test(2, 156 - 123, 123, 156, 1, true);
        await test(2, 156 - 123, 123, 156, 2, true, true);
        // here, the number of actual requests is Ok to be 2..3
        await test(2, 156 - 123, 123, 156, 3, false);
        await test(2, 156 - 123, 123, 156, 3, false, true);
    });

    it("no concurrency, multiple requests", async () => {
        await test(1, 10, 123, 156, 4, true);
        await test(1, 10, 123, 156, 4, false);
    });

    it("two concurrent requests exact", async () => {
        await test(2, 10, 123, 153, 3, true);
        await test(2, 10, 123, 153, 6, true, true);
        await test(2, 10, 123, 153, 5, false);
        await test(2, 10, 123, 153, 8, false, true);
    });

    it("two concurrent requests one over", async () => {
        await test(2, 10, 123, 154, 4, true);
        // here, the number of actual requests is Ok to be 4..5
        await test(2, 10, 123, 154, 5, false);
    });

    it("four concurrent requests", async () => {
        await test(4, 10, 123, 156, 4, true);
        // here, the number of actual requests is Ok to be 4..7
        await test(4, 10, 123, 156, 7, false);
    });

    it("cancellation", async () => {
        await testCancel(1, 1000, 502, 10, 60);
        await testCancel(1, undefined, 502, 10, 60);
    });
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { timeoutPromise, defaultTimeoutDurationMs } from "../timeoutUtils";

describe("TimeoutPromise", () => {
    it("Timeout with no options", async () => {
        try {
            await timeoutPromise(() => {});
            assert(false, "should have timed out");
        } catch (e: any) {
            assert(e.message.startsWith("Timed out"), "expected timeout error message");
        }
    });

    it("Timeout with no duration", async () => {
        try {
            await timeoutPromise(() => { }, {});
            assert(false, "should have timed out");
        } catch (e: any) {
            assert(e.message.startsWith("Timed out"), "expected timeout error message");
        }
    });

    it("Timeout with duration", async () => {
        try {
            await timeoutPromise(() => { }, { durationMs: 1 });
            assert(false, "should have timed out");
        } catch {

        }
    });

    it("Timeout with zero duration", async () => {
        try {
            await timeoutPromise((resolve) => {
                setTimeout(resolve, defaultTimeoutDurationMs + 50);
            }, { durationMs: 0 });
        } catch {
            assert(false, "should not have timed out");
        }
    });

    it("Timeout with negative duration", async () => {
        try {
            await timeoutPromise((resolve) => {
                setTimeout(resolve, defaultTimeoutDurationMs + 50);
            }, { durationMs: -1 });
        } catch {
            assert(false, "should not have timed out");
        }
    });

    it("Timeout with Infinity duration", async () => {
        try {
            await timeoutPromise((resolve) => {
                setTimeout(resolve, defaultTimeoutDurationMs + 50);
            }, { durationMs: Infinity });
        } catch {
            assert(false, "should not have timed out");
        }
    });

    it("no timeout", async () => {
        try {
            await timeoutPromise((resolve) => { setTimeout(resolve, 1); }, { durationMs: 100 });
        } catch {
            assert(false, "should not have timed out");
        }
    });

    it("Timeout with no reject option", async () => {
        try {
            const value = await timeoutPromise(() => {}, {
                durationMs: 1,
                reject: false,
                value: 1,
            });
            assert(value === 1, "expect timeout to return value given in option");
        } catch {
            assert(false, "should not have timed out");
        }
    });

    it("Timeout rejection with error option", async () => {
        try {
            await timeoutPromise(() => {}, {
                durationMs: 1,
                errorMsg: "hello",
            });
            assert(false, "should have timed out");
        } catch (e: any) {
            assert(e.message.startsWith("hello"), "expected timeout reject error message given in option");
        }
    });
});

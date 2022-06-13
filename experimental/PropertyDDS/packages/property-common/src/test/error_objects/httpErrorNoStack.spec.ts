/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

/**
 * @fileoverview Tests the functions exported by error_objects/http_error_no_stack.js
 */

import { expect } from "chai";
import { HTTPError, HTTPErrorNoStack } from "../../index";

describe("property-common.HTTPErrorNoStack", function() {
    const errorMsg = "a test error message";

    describe("object", function() {
        it("is instanceof Error", function(done) {
            expect(new HTTPErrorNoStack() instanceof Error).to.equal(true);
            done();
        });

        it("is instanceof HTTPError", function(done) {
            expect(new HTTPErrorNoStack() instanceof HTTPError).to.equal(true);
            done();
        });

        it("is instanceof HTTPErrorNoStack", function(done) {
            expect(new HTTPErrorNoStack() instanceof HTTPErrorNoStack).to.equal(true);
            done();
        });

        it("has no stack parameter", function(done) {
            const httpErrorNoStack = new HTTPErrorNoStack(errorMsg);
            expect(httpErrorNoStack.stack).to.equal(undefined);
            done();
        });
    });

    describe("flags", function() {
        it("default at 0", function(done) {
            const actual = new HTTPErrorNoStack(errorMsg);
            expect(actual.flags).to.equal(0);
            done();
        });

        it("can be quiet", function(done) {
            const actual = new HTTPErrorNoStack(errorMsg, undefined, undefined, undefined, undefined,
                HTTPErrorNoStack.FLAGS.QUIET);
            expect(actual.isQuiet()).to.equal(true);
            expect(actual.flags).to.equal(HTTPErrorNoStack.FLAGS.QUIET);
            done();
        });

        it("can be extended", function(done) {
            const actual = new HTTPErrorNoStack(errorMsg, undefined, undefined, undefined, undefined,
                HTTPErrorNoStack.FLAGS.QUIET | 4);
            expect(actual.isQuiet()).to.equal(true);
            expect(actual.flags).to.equal(HTTPErrorNoStack.FLAGS.QUIET | 4);
            done();
        });
    });
});

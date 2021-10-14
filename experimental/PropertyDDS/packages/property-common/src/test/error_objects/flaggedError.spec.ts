/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable max-nested-callbacks */
/**
 * @fileoverview Tests the functions exported by error_objects/http_error.js
 */

import { expect } from "chai";
import { FlaggedError } from "../..";

describe("property-common.FlaggedError", function() {
    describe("Flags", function() {
        it("can be extended", function(done) {
            Object.keys(FlaggedError.FLAGS).forEach(function(key, index) {
                expect(FlaggedError.FLAGS[key]).to.equal(Math.pow(2, index));
            });
            done();
        });
    });
});

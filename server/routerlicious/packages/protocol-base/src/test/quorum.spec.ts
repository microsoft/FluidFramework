/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Quorum } from "../quorum";

describe("Loader", () => {
    describe("Quorum", () => {
        let quorum: Quorum;

        beforeEach(() => {
            quorum = new Quorum(
                [],
                [],
                [],
                (key, value) => 0,
                (value) => { return; },
            );
        });

        describe(".propose()", async () => {
            /* tslint:disable:no-floating-promises */
            it("Should be able to propose a new value", () => {
                quorum.propose("hello", "world");
            });
        });
    });
});

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Quorum } from "../quorum";

describe("Loader", () => {
    describe("Quorum", () => {
        let quorum: Quorum;

        beforeEach(() => {
            quorum = new Quorum(
                0,
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

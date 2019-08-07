/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ConsensusRegisterCollectionFactory } from "../extension";
import { IConsensusRegisterCollection, IConsensusRegisterCollectionFactory } from "../interfaces";

describe("Routerlicious", () => {
    describe("Api", () => {
        // tslint:disable:mocha-no-side-effect-code
        generate("ConsensusRegisterCollection", new ConsensusRegisterCollectionFactory());
        function generate(
            name: string,
            factory: IConsensusRegisterCollectionFactory) {

            describe(name, () => {
                let testCollection: IConsensusRegisterCollection;

                beforeEach(async () => {
                    testCollection = factory.create(null, "consensus-register-collection");
                });

                it("Can create a collection", () => {
                    assert.ok(testCollection);
                });
            });
        }
    });
});

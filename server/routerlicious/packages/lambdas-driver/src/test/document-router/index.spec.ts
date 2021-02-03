/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPartitionLambdaFactory, LambdaCloseType } from "@fluidframework/server-services-core";
import { TestContext } from "@fluidframework/server-test-utils";
import { strict as assert } from "assert";
import nconf from "nconf";
import * as path from "path";
import * as plugin from "../../document-router";

describe("document-router", () => {
    describe("Plugin", () => {
        const defaultConfig = {
            documentLambda: path.join(__dirname, "./testDocumentLambda"),
        };

        let factory: IPartitionLambdaFactory;
        let config: nconf.Provider;

        beforeEach(async () => {
            config = (new nconf.Provider({})).defaults(defaultConfig).use("memory");
            factory = await plugin.create(config);
        });

        afterEach(async () => {
            await factory.dispose();
        });

        describe(".create", () => {
            it("Should be able to create a new lambda", async () => {
                const context = new TestContext();
                const lambda = await factory.create(config, context);
                assert.ok(lambda);
                lambda.close(LambdaCloseType.Stop);
            });
        });
    });
});

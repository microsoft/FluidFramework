/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPartitionLambdaFactory } from "@microsoft/fluid-server-services-core";
import { TestContext } from "@microsoft/fluid-server-test-utils";
import * as assert from "assert";
import { Provider } from "nconf";
import { DocumentLambdaFactory } from "../../document-router/lambdaFactory";
import { create, TestLambdaFactory } from "./testDocumentLambda";

describe("document-router", () => {
    describe("DocumentLambdaFactory", () => {
        let config: Provider;
        let factory: IPartitionLambdaFactory;
        let testContext: TestContext;
        let documentFactory: TestLambdaFactory;

        beforeEach(async () => {
            config = (new Provider({})).defaults({}).use("memory");
            documentFactory = create(config) as TestLambdaFactory;
            factory = new DocumentLambdaFactory(documentFactory);
            testContext = new TestContext();
        });

        describe(".create", () => {
            it("Should create a new IPartitionLambda", async () => {
                const lambda = await factory.create(config, testContext);
                assert.ok(lambda);
            });
        });

        describe(".dispose", () => {
            it("Should dispose of the factory", async () => {
                await factory.dispose();
                assert.ok(documentFactory.disposed);
            });
        });
    });
});

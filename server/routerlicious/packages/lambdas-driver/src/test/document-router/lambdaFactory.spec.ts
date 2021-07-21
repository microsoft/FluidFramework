/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DefaultServiceConfiguration, IPartitionConfig, IPartitionLambdaFactory, LambdaCloseType } from "@fluidframework/server-services-core";
import { TestContext } from "@fluidframework/server-test-utils";
import { strict as assert } from "assert";
import { DocumentLambdaFactory } from "../../document-router/lambdaFactory";
import { create, TestLambdaFactory } from "./testDocumentLambda";

describe("document-router", () => {
    describe("DocumentLambdaFactory", () => {
        let factory: IPartitionLambdaFactory<IPartitionConfig>;
        let testContext: TestContext;
        let documentFactory: TestLambdaFactory;

        beforeEach(async () => {
            documentFactory = create() as TestLambdaFactory;
            factory = new DocumentLambdaFactory(documentFactory, DefaultServiceConfiguration.documentLambda);
            testContext = new TestContext();
        });

        describe(".create", () => {
            it("Should create a new IPartitionLambda", async () => {
                const lambda = await factory.create({ leaderEpoch: 0 }, testContext);
                assert.ok(lambda);
                lambda.close(LambdaCloseType.Stop);
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

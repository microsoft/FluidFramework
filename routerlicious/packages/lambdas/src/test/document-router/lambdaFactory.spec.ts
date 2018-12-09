import { TestContext } from "@prague/test-utils";
import * as assert from "assert";
import { Provider } from "nconf";
import { DocumentLambdaFactory } from "../../document-router/lambdaFactory";
import { IPartitionLambdaFactory } from "../../kafka-service/lambdas";
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

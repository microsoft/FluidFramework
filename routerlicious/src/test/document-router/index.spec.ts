import * as assert from "assert";
import * as nconf from "nconf";
import * as path from "path";
import * as plugin from "../../document-router";
import { IContext, IPartitionLambdaFactory } from "../../kafka-service/lambdas";

class TestContext implements IContext {
    public offset;

    public checkpoint(offset: number) {
        this.offset = offset;
    }
}

describe("DocumentRouter", () => {
    describe("Plugin", () => {
        const defaultConfig = {
            documentLambda: path.join(__dirname, "../testUtils/testDocumentLambda"),
        };

        let factory: IPartitionLambdaFactory;
        let config: nconf.Provider;

        beforeEach(() => {
            factory = plugin.create();
            config = (new nconf.Provider({})).defaults(defaultConfig).use("memory");
        });

        describe("id", () => {
            it("Should provide a plugin id", () => {
                assert.ok(plugin.id);
            });
        });

        describe(".create", () => {
            it("Should be able to create a new lambda", async () => {
                const context = new TestContext();
                const lambda = await factory.create(config, context);
                assert.ok(lambda);
            });
        });
    });
});

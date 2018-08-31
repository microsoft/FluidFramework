import { utils as coreUtils } from "@prague/client-api";
import * as assert from "assert";
import { Provider } from "nconf";
import * as utils from "../../utils";
import { TestKafka, TestProducer } from "../testUtils/index";

class TestResources implements utils.IResources {
    public async dispose(): Promise<void> {
        return;
    }
}

class TestRunner implements utils.IRunner {
    private deferred = new coreUtils.Deferred<void>();

    constructor(private fail: boolean) {
    }

    public start(): Promise<void> {
        // Stop after 1ms of running
        setTimeout(() => {
            if (this.fail) {
                this.deferred.reject("TestRunner set to fail");
            } else {
                this.deferred.resolve();
            }
        }, 1);
        return this.deferred.promise;
    }

    public stop(): Promise<void> {
        return this.deferred.promise;
    }
}

class TestResourcesFactory implements utils.IResourcesFactory<TestResources> {
    public async create(config: Provider): Promise<TestResources> {
        return new TestResources();
    }
}

class TestRunnerFactory implements utils.IRunnerFactory<TestResources> {
    private failRunner = false;

    public setFailRunner(value: boolean) {
        this.failRunner = value;
    }

    public async create(resources: TestResources): Promise<utils.IRunner> {
        return new TestRunner(this.failRunner);
    }
}

describe("Routerlicious", () => {
    describe("Utils", () => {
        describe("runTracked", () => {
            let testConfig: Provider;
            let testProducer: TestProducer;

            beforeEach(() => {
                testConfig = (new Provider({})).defaults({}).use("memory");
                const testKafka = new TestKafka();
                testProducer = testKafka.createProducer();
            });

            it("Should exit with resolved promise once runner completes successfully", async () => {
                const resourcesFactory = new TestResourcesFactory();
                const runnerFactory = new TestRunnerFactory();
                await utils.runTracked(testConfig, testProducer, "test", resourcesFactory, runnerFactory);
            });

            it("Should exit with rejected promise once runner errors", async () => {
                const resourcesFactory = new TestResourcesFactory();
                const runnerFactory = new TestRunnerFactory();
                runnerFactory.setFailRunner(true);
                await utils.runTracked(testConfig, testProducer, "test", resourcesFactory, runnerFactory).then(
                    () => {
                        assert(false, "runTracked should have returned a broken promise");
                    },
                    (error) => {
                        assert(true);
                    });
            });
        });
    });
});

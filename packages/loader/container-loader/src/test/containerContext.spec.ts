import { strict } from "assert";
import Sinon from "sinon";
import {
    IContainerEvents,
    ILoader,
    IRuntime,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { IFluidCodeDetails, IFluidObject } from "@fluidframework/core-interfaces";
import {
    IDocumentAttributes,
    IQuorum,
} from "@fluidframework/protocol-definitions";
import {
    DebugLogger,
    EventEmitterWithErrorHandling,
} from "@fluidframework/telemetry-utils";
import { Container } from "../container";
import { ContainerContext } from "../containerContext";
import { ICodeDetailsLoader } from "../loader";

describe("ContainerContext Tests", () => {
    let sandbox: Sinon.SinonSandbox;

    const testPackageName = "@fluid-test/test-package";
    const codeDetailsForVersion = (version: string) => ({
        package: {
            name: testPackageName,
            version,
            fluid: { browser: {} },
        },
        config: {},
    });
    const quorumCodeDetails = codeDetailsForVersion("1.0.0");

    const mockRuntimeFactory = new (class implements IRuntimeFactory {
        async instantiateRuntime() {
            return (sandbox.stub() as unknown) as IRuntime;
        }
        get IRuntimeFactory(): IRuntimeFactory {
            return this;
        }
    })();

    const mockContainer = new (class extends EventEmitterWithErrorHandling<IContainerEvents> {
        subLogger = DebugLogger.create("fluid:test");
    })();

    const createTestContext = async (codeLoader: unknown /* ICodeDetailsLoader */) => {
        return ContainerContext.createOrLoad(
            (mockContainer as unknown) as Container,
            (sandbox.stub() as unknown) as IFluidObject,
            codeLoader as ICodeDetailsLoader,
            quorumCodeDetails,
            undefined,
            (sandbox.stub() as unknown) as IDocumentAttributes,
            sandbox.stub() as any,
            (sandbox.stub() as unknown) as IQuorum,
            (sandbox.stub() as unknown) as ILoader,
            Sinon.fake(),
            Sinon.fake(),
            Sinon.fake(),
            Sinon.fake(),
            Container.version,
            Sinon.fake(),
        );
    };

    beforeEach(() => {
        sandbox = Sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("Should load code without details", async () => {
        // Arrange
        const simpleCodeLoader = { load: async () => {} };
        const mockCodeLoader = sandbox.mock(simpleCodeLoader);
        mockCodeLoader
            .expects("load")
            .once()
            .resolves({ fluidExport: mockRuntimeFactory });

        // Act
        const testContext = await createTestContext(simpleCodeLoader);

        // Assert
        strict.ok(testContext);
        strict.ok((testContext as any).runtime);

        const proposedCodeDetails = codeDetailsForVersion("2.0.0");
        const satisfies = await testContext.satisfies(proposedCodeDetails);
        strict.equal(
            satisfies,
            false,
            "When no comparers are provided context will assume the running code is not compatible.",
        );
        mockCodeLoader.verify();
    });

    it("Should load code with details", async () => {
        // Arrange
        const moduleCodeDetails = codeDetailsForVersion("3.0.0");
        const codeDetailsLoader = {
            load: async () => {},
            get IFluidCodeDetailsComparer() {
                return this;
            },
            satisfies: async (candidate: IFluidCodeDetails, constraint: IFluidCodeDetails) => {},
        };
        const mockCodeLoader = sandbox.mock(codeDetailsLoader);
        mockCodeLoader
            .expects("load")
            .once()
            .resolves({
                module: { fluidExport: mockRuntimeFactory },
                details: moduleCodeDetails,
            });

        const testContext = await createTestContext(codeDetailsLoader);
        strict.ok(testContext);
        strict.ok((testContext as any).runtime);

        const proposedCodeDetails = codeDetailsForVersion("2.0.0");
        mockCodeLoader
            .expects("satisfies")
            .once()
            .withExactArgs(moduleCodeDetails, proposedCodeDetails)
            .resolves(true);

        // Act
        const satisfies = await testContext.satisfies(proposedCodeDetails);

        // Assert
        strict.ok(satisfies);
        mockCodeLoader.verify();
    });
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict } from "assert";
import Sinon from "sinon";
import {
    IContainerEvents,
    ILoader,
    IRuntime,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import {
    IFluidCodeDetails,
    IFluidObject,
} from "@fluidframework/core-interfaces";
import {
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

    const createTestContext = async (
        codeLoader: unknown, /* ICodeDetailsLoader */
        existing: boolean = true,
    ) => {
        return ContainerContext.createOrLoad(
            (mockContainer as unknown) as Container,
            (sandbox.stub() as unknown) as IFluidObject,
            codeLoader as ICodeDetailsLoader,
            quorumCodeDetails,
            undefined,
            sandbox.stub() as any,
            (sandbox.stub() as unknown) as IQuorum,
            (sandbox.stub() as unknown) as ILoader,
            Sinon.fake(),
            Sinon.fake(),
            Sinon.fake(),
            Sinon.fake(),
            Container.version,
            Sinon.fake(),
            existing,
        );
    };

    beforeEach(() => {
        sandbox = Sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("Should load code using legacy loader", async () => {
        // Arrange
        const proposedCodeDetails = codeDetailsForVersion("2.0.0");

        const simpleCodeLoader = { load: async () => {} };
        const mockCodeLoader = sandbox.mock(simpleCodeLoader);
        // emulate legacy ICodeLoader
        mockCodeLoader
            .expects("load")
            .once()
            .resolves({ fluidExport: mockRuntimeFactory });

        // Act
        const testContext = await createTestContext(simpleCodeLoader);

        // Assert
        strict.ok(testContext);
        strict.ok((testContext as any).runtime);

        const satisfies = await testContext.satisfies(proposedCodeDetails);
        strict.equal(
            satisfies,
            false,
            "When no comparers are provided context will assume the running code is not compatible.",
        );
        mockCodeLoader.verify();
    });

    it("Should load code without details", async () => {
        // Arrange
        const proposedCodeDetails = codeDetailsForVersion("2.0.0");

        const codeDetailsLoader = {
            load: async () => {},
            get IFluidCodeDetailsComparer() {
                return this;
            },
            satisfies: async (
                candidate: IFluidCodeDetails,
                constraint: IFluidCodeDetails,
            ) => {},
        };
        const mockCodeLoader = sandbox.mock(codeDetailsLoader);
        mockCodeLoader
            .expects("load")
            .once()
            .resolves({
                module: { fluidExport: mockRuntimeFactory },
            });
        mockCodeLoader
            .expects("satisfies")
            .once()
            .withExactArgs(quorumCodeDetails, proposedCodeDetails)
            .resolves(true);

        // Act
        const testContext = await createTestContext(codeDetailsLoader);

        // Assert
        strict.ok(testContext);
        strict.ok((testContext as any).runtime);

        const satisfies = await testContext.satisfies(proposedCodeDetails);
        strict.ok(satisfies);
        mockCodeLoader.verify();
    });

    it("Should load code with details", async () => {
        // Arrange
        const proposedCodeDetails = codeDetailsForVersion("2.0.0");
        const moduleCodeDetails = codeDetailsForVersion("3.0.0");

        const codeDetailsLoader = {
            load: async () => {},
            get IFluidCodeDetailsComparer() {
                return this;
            },
            satisfies: async (
                candidate: IFluidCodeDetails,
                constraint: IFluidCodeDetails,
            ) => {},
        };
        const mockCodeLoader = sandbox.mock(codeDetailsLoader);
        mockCodeLoader
            .expects("load")
            .once()
            .resolves({
                module: { fluidExport: mockRuntimeFactory },
                details: moduleCodeDetails,
            });
        mockCodeLoader
            .expects("satisfies")
            .once()
            .withExactArgs(moduleCodeDetails, proposedCodeDetails)
            .resolves(true);

        // Act
        const testContext = await createTestContext(codeDetailsLoader);

        // Assert
        strict.ok(testContext);
        strict.ok((testContext as any).runtime);

        const satisfies = await testContext.satisfies(proposedCodeDetails);
        strict.ok(satisfies);
        mockCodeLoader.verify();
    });
});

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { PrimedComponent, PrimedComponentFactory, SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { initializeContainerCode } from "@microsoft/fluid-base-host";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    ICodeLoader,
    IFluidCodeDetails,
    IProxyLoaderFactory,
} from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import {
    CreationDocumentServiceFactory,
    CreationDriverUrlResolver,
} from "@microsoft/fluid-experimental-creation-driver";
import { ScopeType } from "@microsoft/fluid-protocol-definitions";
import { IComponentContext, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { SharedString } from "@microsoft/fluid-sequence";

/**
 * Implementation of counter component for testing.
 */
export class TestComponent extends PrimedComponent {
    public static readonly type = "@chaincode/test-component";

    public static getFactory() { return TestComponent.factory; }

    private static readonly factory = new PrimedComponentFactory(
        TestComponent,
        [ SharedString.getFactory() ],
    );

    private _sharedString: SharedString | undefined;

    public get sharedString(): SharedString {
        if (this._sharedString === undefined) {
            throw new Error("SharedString has not been created yet");
        }
        return this._sharedString;
    }

    constructor(runtime: IComponentRuntime, context: IComponentContext) {
        super(runtime, context);
    }

    protected async componentInitializingFirstTime() {
        const sharedString = SharedString.create(this.runtime);
        this.root.set("sharedString", sharedString.handle);
    }

    protected async componentHasInitialized() {
        this._sharedString = await this.root.get<IComponentHandle<SharedString>>("sharedString").get();
    }
}

const fluidExport = new SimpleModuleInstantiationFactory(
    "default",
    new Map([
        ["default", Promise.resolve(TestComponent.getFactory())],
    ]),
);

describe("In Memory Driver", () => {
    const id = "fluid-test://localhost?uniqueId=inMemoryDriverTest";
    let component: TestComponent;

    function createInMemoryDriverLoader(): Loader {
        const urlResolver: CreationDriverUrlResolver = new CreationDriverUrlResolver();
        const documentServiceFactory = new CreationDocumentServiceFactory();
        const codeLoader: ICodeLoader = {
            load: async <T>() => ({ fluidExport } as unknown as T),
        };

        // The default client to be used.
        const client = {
            mode: "write",
            details: { capabilities: { interactive: false } },
            permission: ["write"],
            scopes: [ScopeType.DocWrite],
            user: { id: "testUser" },
        };

        return new Loader(
            urlResolver,
            documentServiceFactory,
            codeLoader,
            { client },
            {},
            new Map<string, IProxyLoaderFactory>());
    }

    async function createContainer(): Promise<Container> {
        const loader: Loader = createInMemoryDriverLoader();

        const container = await loader.resolve({ url: id });

        await initializeContainerCode(container, {} as any as IFluidCodeDetails);

        return container;
    }

    async function getComponent(componentId: string, container: Container): Promise<TestComponent> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as TestComponent;
    }

    beforeEach(async () => {
        const container = await createContainer();
        component = await getComponent("default", container);
    });

    it("can create and set value in a SharedString in an in-memory Container", async () => {
        const sharedString = component.sharedString;
        const text = "syncSharedString";
        sharedString.insertText(0, text);
        assert.equal(sharedString.getText(), text, "The retrieved text should match the inserted text.");
    });
});

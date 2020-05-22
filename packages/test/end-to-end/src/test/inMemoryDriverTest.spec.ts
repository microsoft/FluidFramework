/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import {
    ICodeLoader,
    IFluidCodeDetails,
    IProxyLoaderFactory,
} from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import {
    CreationDocumentServiceFactory,
    CreationDriverUrlResolver,
} from "@fluidframework/experimental-creation-driver";
import {
    ITestFluidComponent,
    initializeLocalContainer,
    LocalCodeLoader,
    TestFluidComponentFactory,
} from "@fluidframework/test-utils";
import { ScopeType } from "@fluidframework/protocol-definitions";
import { SharedString } from "@fluidframework/sequence";

describe("In Memory Driver", () => {
    const id = "fluid-test://localhost?uniqueId=inMemoryDriverTest";
    const stringId = "stringKey";
    const codeDetails: IFluidCodeDetails = {
        package: "inMemoryDriverTestPackage",
        config: {},
    };
    let component: ITestFluidComponent;

    function createInMemoryDriverLoader(): Loader {
        const urlResolver: CreationDriverUrlResolver = new CreationDriverUrlResolver();
        const documentServiceFactory = new CreationDocumentServiceFactory();
        const factory = new TestFluidComponentFactory([[ stringId, SharedString.getFactory() ]]);
        const codeLoader: ICodeLoader = new LocalCodeLoader([[ codeDetails, factory ]]);

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
        return initializeLocalContainer(id, loader, codeDetails);
    }

    async function getComponent(componentId: string, container: Container): Promise<ITestFluidComponent> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as ITestFluidComponent;
    }

    beforeEach(async () => {
        const container = await createContainer();
        component = await getComponent("default", container);
    });

    it("can create and set value in a SharedString in an in-memory Container", async () => {
        const sharedString = await component.getSharedObject<SharedString>(stringId);
        const text = "syncSharedString";
        sharedString.insertText(0, text);
        assert.equal(sharedString.getText(), text, "The retrieved text should match the inserted text.");
    });
});

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IFluidCodeDetails, ILoader } from "@microsoft/fluid-container-definitions";
import { Container } from "@microsoft/fluid-container-loader";
import { DocumentDeltaEventManager } from "@microsoft/fluid-local-driver";
import { createLocalLoader, initializeLocalContainer } from "@microsoft/fluid-local-loader-utils";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { SharedString } from "@microsoft/fluid-sequence";
import { LocalDeltaConnectionServer, ILocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import {
    TestComponentSharedObjectsMap,
    ITestFluidComponent,
    TestFluidComponentFactory,
} from "@microsoft/fluid-test-utils";

describe("SharedString", () => {
    const id = "SharedStringTest";
    const codeDetails = {} as any as IFluidCodeDetails;

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let documentDeltaEventManager: DocumentDeltaEventManager;
    let loader: ILoader;
    let component1: ITestFluidComponent;
    let component2: ITestFluidComponent;

    async function getComponent(componentId: string, container: Container): Promise<ITestFluidComponent> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as ITestFluidComponent;
    }

    beforeEach(async () => {
        const sharedObjects: TestComponentSharedObjectsMap = new Map<string, ISharedObjectFactory>();
        sharedObjects.set("sharedString", SharedString.getFactory());
        const factory = new TestFluidComponentFactory(sharedObjects);

        deltaConnectionServer = LocalDeltaConnectionServer.create();
        loader = createLocalLoader(factory, deltaConnectionServer);

        const container1 = await initializeLocalContainer(id, loader, codeDetails);
        component1 = await getComponent("default", container1);

        const container2 = await initializeLocalContainer(id, loader, codeDetails);
        component2 = await getComponent("default", container2);

        documentDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
        documentDeltaEventManager.registerDocuments(container1, container2);
    });

    it("can sync SharedString across multiple containers", async () => {
        const text = "syncSharedString";
        const sharedString1 = await component1.getSharedObject<SharedString>("sharedString");
        sharedString1.insertText(0, text);
        assert.equal(sharedString1.getText(), text);

        await documentDeltaEventManager.process();

        const sharedString2 = await component2.getSharedObject<SharedString>("sharedString");
        assert.equal(sharedString2.getText(), text);
    });

    it("can sync SharedString to a newly loaded container", async () => {
        const text = "syncToNewConatiner";
        const sharedString1 = await component1.getSharedObject<SharedString>("sharedString");
        sharedString1.insertText(0, text);
        const text1 = sharedString1.getText();
        assert.equal(text1, text);

        await documentDeltaEventManager.process();

        const newContainer = await initializeLocalContainer(id, loader, codeDetails);
        const newComponent = await getComponent("default", newContainer);
        const newSharedString = await newComponent.getSharedObject<SharedString>("sharedString");
        assert.equal(newSharedString.getText(), text);
    });
});

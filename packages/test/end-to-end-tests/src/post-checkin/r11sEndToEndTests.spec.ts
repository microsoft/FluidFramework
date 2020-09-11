/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import * as moniker from "moniker";
import uuid from "uuid";
import { IRequest } from "@fluidframework/core-interfaces";
import { IFluidCodeDetails, IProxyLoaderFactory, AttachState } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import {
    LocalCodeLoader,
    TestFluidObjectFactory,
    ITestFluidObject,
} from "@fluidframework/test-utils";
import { SharedMap } from "@fluidframework/map";
import { RouterliciousDocumentServiceFactory, DefaultErrorTracking } from "@fluidframework/routerlicious-driver";
import { InsecureUrlResolver } from "@fluidframework/test-runtime-utils";
import { IUser } from "@fluidframework/protocol-definitions";
import { Deferred } from "@fluidframework/common-utils";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";

describe(`r11s End-To-End tests`, () => {
    const codeDetails: IFluidCodeDetails = {
        package: "detachedContainerTestPackage1",
        config: {},
    };
    const mapId1 = "mapId1";
    const mapId2 = "mapId2";

    let request: IRequest;
    let loader: Loader;

    function createTestLoader(urlResolver: IUrlResolver): Loader {
        const factory: TestFluidObjectFactory = new TestFluidObjectFactory([
            [mapId1, SharedMap.getFactory()],
            [mapId2, SharedMap.getFactory()],
        ]);
        const codeLoader = new LocalCodeLoader([[codeDetails, factory]]);
        const documentServiceFactory = new RouterliciousDocumentServiceFactory(
            false,
            new DefaultErrorTracking(),
            false,
            true,
            undefined,
        );
        return new Loader(
            urlResolver,
            documentServiceFactory,
            codeLoader,
            {},
            {},
            new Map<string, IProxyLoaderFactory>());
    }

    const createFluidObject = (async (
        componentContext: IFluidDataStoreContext,
        type: string,
    ) => {
        return requestFluidObject<ITestFluidObject>(
            await componentContext.containerRuntime.createDataStore(type),
            "");
    });

    const getUser = (): IUser => ({
        id: uuid(),
    });

    function getResolver(): InsecureUrlResolver {
        const bearerSecret = process.env.fluid__webpack__bearerSecret;
        const tenantId = process.env.fluid__webpack__tenantId ?? "fluid";
        const tenantSecret = process.env.fluid__webpack__tenantSecret;
        const fluidHost = process.env.fluid__webpack__fluidHost;

        return new InsecureUrlResolver(
            fluidHost,
            fluidHost.replace("www", "alfred"),
            fluidHost.replace("www", "historian"),
            tenantId,
            tenantSecret,
            getUser(),
            bearerSecret);
    }

    beforeEach(async () => {
        const urlResolver = getResolver();
        const documentId = moniker.choose();
        request = urlResolver.createCreateNewRequest(documentId);
        loader = createTestLoader(urlResolver);
    });

    it("Container creation in r11s", async () => {
        const container = await loader.createDetachedContainer(codeDetails);
        assert.strictEqual(container.attachState, AttachState.Detached, "Container should be detached");
        await container.attach(request);
        assert.strictEqual(container.attachState, AttachState.Attached, "Container should now be created on r11s");
        assert.strictEqual(container.closed, false, "Container should be open");
        assert.strictEqual(container.deltaManager.inbound.length, 0, "Inbound queue should be empty");
    });

    it("Load attached container and check for components", async () => {
        const container = await loader.createDetachedContainer(codeDetails);
        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const component = response.value as ITestFluidObject;

        // Create a sub component of type TestFluidComponent.
        const subComponent1 = await createFluidObject(component.context, "default");
        component.root.set("attachKey", subComponent1.handle);

        // Now attach the container and get the sub component.
        await container.attach(request);

        // Now load the container from another loader.
        const urlResolver2 = getResolver();
        const loader2 = createTestLoader(urlResolver2);
        // Create a new request url from the resolvedUrl of the first container.
        const requestUrl2 = await urlResolver2.getAbsoluteUrl(container.resolvedUrl, "");
        const container2 = await loader2.resolve({ url: requestUrl2 });

        // Get the sub component and assert that it is attached.
        const response2 = await container2.request({ url: `/${subComponent1.context.id}` });
        const subComponent2 = response2.value as ITestFluidObject;
        assert.strictEqual(subComponent2.runtime.IFluidHandleContext.isAttached, true,
            "Component should be attached!!");

        // Verify the attributes of the root channel of both sub components.
        const testChannel1 = await subComponent1.runtime.getChannel("root");
        const testChannel2 = await subComponent2.runtime.getChannel("root");
        assert.strictEqual(testChannel2.isAttached(), true, "Channel should be attached!!");
        assert.strictEqual(JSON.stringify(testChannel2.snapshot()), JSON.stringify(testChannel1.snapshot()),
            "Value for snapshot should be same!!");
        assert.strictEqual(testChannel2.isAttached(), testChannel1.isAttached(),
            "Value for isAttached should persist!!");
    });

    it("Fire ops during container attach for shared map", async () => {
        const ops = { key: "1", type: "set", value: { type: "Plain", value: "b" } };
        const defPromise = new Deferred();
        const container = await loader.createDetachedContainer(codeDetails);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        container.deltaManager.submit = (type, contents, batch, metadata) => {
            assert.strictEqual(contents.contents.contents.content.address,
                mapId1, "Address should be shared map");
            assert.strictEqual(JSON.stringify(contents.contents.contents.content.contents),
                JSON.stringify(ops), "Ops should be equal");
            defPromise.resolve();
            return 0;
        };

        // Get the root component from the detached container.
        const response = await container.request({ url: "/" });
        const component = response.value as ITestFluidObject;
        const testChannel1 = await component.getSharedObject<SharedMap>(mapId1);

        // Fire op before attaching the container
        testChannel1.set("0", "a");
        const containerP = container.attach(request);

        // Fire op after the summary is taken and before it is attached.
        testChannel1.set("1", "b");
        await containerP;

        await defPromise.promise;
    });
});

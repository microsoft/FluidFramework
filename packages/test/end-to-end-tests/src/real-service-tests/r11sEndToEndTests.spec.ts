/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import * as moniker from "moniker";
import uuid from "uuid";
import { IRequest, IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { AttachState } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import {
    LocalCodeLoader,
    TestFluidObjectFactory,
    ITestFluidObject,
} from "@fluidframework/test-utils";
import { SharedMap } from "@fluidframework/map";
import {
    RouterliciousDocumentServiceFactory,
    DefaultErrorTracking,
    ITokenProvider } from "@fluidframework/routerlicious-driver";
import { InsecureTokenProvider, InsecureUrlResolver } from "@fluidframework/test-runtime-utils";
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

    interface ITestParameters {
        fluidHost: string;
        bearerSecret: string
        tenantId: string;
        tenantSecret: string;
    }

    function createTestLoader(urlResolver: IUrlResolver, tokenProvider: ITokenProvider): Loader {
        const factory: TestFluidObjectFactory = new TestFluidObjectFactory([
            [mapId1, SharedMap.getFactory()],
            [mapId2, SharedMap.getFactory()],
        ]);
        const codeLoader = new LocalCodeLoader([[codeDetails, factory]]);
        const documentServiceFactory = new RouterliciousDocumentServiceFactory(
            tokenProvider,
            false,
            new DefaultErrorTracking(),
            false,
            true,
            undefined,
        );
        return new Loader({
            urlResolver,
            documentServiceFactory,
            codeLoader,
        });
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

    function getParameters(): ITestParameters {
        const bearerSecret = process.env.fluid__webpack__bearerSecret;
        const tenantId = process.env.fluid__webpack__tenantId ?? "fluid";
        const tenantSecret = process.env.fluid__webpack__tenantSecret;
        const fluidHost = process.env.fluid__webpack__fluidHost;

        assert(bearerSecret, "Missing bearer secret");
        assert(tenantId, "Missing tenantId");
        assert(tenantSecret, "Missing tenant secret");
        assert(fluidHost, "Missing Fluid host");

        return {
            fluidHost,
            bearerSecret,
            tenantId,
            tenantSecret,
        };
    }

    function getResolver(params: ITestParameters): InsecureUrlResolver {
        const urlResolver =  new InsecureUrlResolver(
            params.fluidHost,
            params.fluidHost.replace("www", "alfred"),
            params.fluidHost.replace("www", "historian"),
            params.tenantId,
            params.bearerSecret,
            true);
        return urlResolver;
    }

    beforeEach(async () => {
        const params = getParameters();
        const urlResolver = getResolver(params);
        const documentId = moniker.choose();
        request = urlResolver.createCreateNewRequest(documentId);

        const tokenProvider = new InsecureTokenProvider(
            params.tenantId,
            documentId,
            params.tenantSecret,
            getUser(),
        );
        loader = createTestLoader(urlResolver, tokenProvider);
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
        assert(container.resolvedUrl, "attached container should have resolved URL");

        // Now load the container from another loader.
        const params = getParameters();
        const urlResolver2 = getResolver(params);
        const tokenProvider2 = new InsecureTokenProvider(params.tenantId, container.id, params.tenantSecret, getUser());
        const loader2 = createTestLoader(urlResolver2, tokenProvider2);
        // Create a new request url from the resolvedUrl of the first container.
        const requestUrl2 = await urlResolver2.getAbsoluteUrl(container.resolvedUrl, "");
        const container2 = await loader2.resolve({ url: requestUrl2 });

        // Get the sub component and assert that it is attached.
        const response2 = await container2.request({ url: `/${subComponent1.context.id}` });
        const subComponent2 = response2.value as ITestFluidObject;
        assert(subComponent2.runtime.attachState !== AttachState.Detached,
            "Component should be attached!!");

        // Verify the attributes of the root channel of both sub components.
        const testChannel1 = await subComponent1.runtime.getChannel("root");
        const testChannel2 = await subComponent2.runtime.getChannel("root");
        assert.strictEqual(testChannel2.isAttached(), true, "Channel should be attached!!");
        assert.strictEqual(testChannel2.isAttached(), testChannel1.isAttached(),
            "Value for isAttached should persist!!");

        // back-compat for N-2 <= 0.28, remove the else part when N-2 >= 0.29
        if (testChannel1.summarize && testChannel2.summarize) {
            assert.strictEqual(JSON.stringify(testChannel2.summarize()), JSON.stringify(testChannel1.summarize()),
                "Value for summarize should be same!!");
        } else {
            assert.strictEqual(
                JSON.stringify((testChannel2 as SharedMap).snapshot()),
                JSON.stringify((testChannel1 as SharedMap).snapshot()),
                "Value for summarize should be same!!");
        }
    });

    it("Fire ops during container attach for shared map", async () => {
        const ops = { key: "1", type: "set", value: { type: "Plain", value: "b" } };
        const defPromise = new Deferred();
        const container = await loader.createDetachedContainer(codeDetails);
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

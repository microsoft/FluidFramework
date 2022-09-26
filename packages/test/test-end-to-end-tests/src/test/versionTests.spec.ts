/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { describeWithVersions, getContainerRuntimeApi } from "@fluidframework/test-version-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { IContainer } from "@fluidframework/container-definitions";
import { SharedMap } from "@fluidframework/map";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { ITestFluidObject, ITestObjectProvider, TestFluidObjectFactory } from "@fluidframework/test-utils";
import { DefaultSummaryConfiguration, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { requestFluidObject } from "@fluidframework/runtime-utils";

const oldVersions = ["1.0.0", "1.0.1", "0.56.0"];

describeWithVersions({ specificVersions: oldVersions }, 30000 /* timeout */)(
    "Tests with different Fluid versions installed",
    (getTestObjectProvider) => {
        let provider: ITestObjectProvider;
        beforeEach(() => {
            provider = getTestObjectProvider();
        });

        const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
            runtime.IFluidHandleContext.resolveHandle(request);
        const mapId = "map";
        const factory: TestFluidObjectFactory = new TestFluidObjectFactory(
            [
                [mapId, SharedMap.getFactory()],
            ],
            "default",
        );
        const IdleDetectionTime = 100;
        const runtimeOptions: IContainerRuntimeOptions = {
            summaryOptions: {
                summaryConfigOverrides: {
                    ...DefaultSummaryConfiguration,
                    ...{
                        minIdleTime: IdleDetectionTime,
                        maxIdleTime: IdleDetectionTime,
                        maxTime: IdleDetectionTime * 12,
                        initialSummarizerDelayMs: 10,
                    },
                },
            },
            gcOptions: {
                gcAllowed: true,
            },
        };

        const createOldContainer = async (oldVersion: string): Promise<IContainer> => {
            const oldContainerRuntimeFactoryWithDefaultDataStore =
                getContainerRuntimeApi(oldVersion).ContainerRuntimeFactoryWithDefaultDataStore;
            const oldRuntimeFactory =
                new oldContainerRuntimeFactoryWithDefaultDataStore(
                    factory,
                    [
                        [factory.type, Promise.resolve(factory)],
                    ],
                    undefined,
                    [innerRequestHandler],
                    runtimeOptions,
                );

            return provider.createContainer(oldRuntimeFactory);
        };

        oldVersions.forEach((version: string) => {
            it(`Test runtime version: ${version}`, async () => {
                const oldContainer = await createOldContainer(version);
                const oldDataObject = await requestFluidObject<ITestFluidObject>(oldContainer, "/");
                assert.strictEqual(
                    (oldDataObject.context.containerRuntime as any)
                        .createContainerMetadata.createContainerRuntimeVersion,
                    version);
            });
        });
    });

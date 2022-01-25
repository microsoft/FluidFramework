/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainerLoadMode, LoaderHeader } from "@fluidframework/container-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    createLoader,
    ITestContainerConfig,
    ITestFluidObject,
    timeoutPromise,
} from "@fluidframework/test-utils";
import { Container } from "@fluidframework/container-loader";
import { SummaryCollection } from "@fluidframework/container-runtime";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import {generatePairwiseOptions} from "@fluidframework/test-pairwise-generator";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@fluidframework/driver-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";

const loadOptions: IContainerLoadMode[] =
    generatePairwiseOptions<IContainerLoadMode>({
            deltaConnection: [undefined, "none", "delayed"],
            opsBeforeReturn: [undefined, "cached", "all"],
        });

const testConfigs =
    generatePairwiseOptions({
        loadOptions,
        waitForSummary: [true, false],
    });

const maxOps = 10;
const testContainerConfig: ITestContainerConfig = {
    runtimeOptions: {
        // strictly control summarization
        summaryOptions: {
            disableSummaries: true,
            initialSummarizerDelayMs: 0,
            summaryConfigOverrides: { maxOps },
        },
    },
};

describeFullCompat("No Delta stream loading mode testing", (getTestObjectProvider) => {
    for(const testConfig of testConfigs) {
        it.skip(`Validate Load Modes: ${JSON.stringify(testConfig ?? "undefined")}`, async function() {
            const provider  = getTestObjectProvider();
            let containerUrl: IResolvedUrl | undefined;
            // initialize the container and its data
            {
                const initLoader = createLoader(
                    [[provider.defaultCodeDetails, provider.createFluidEntryPoint(testContainerConfig)]],
                    provider.documentServiceFactory,
                    provider.urlResolver,
                );

                const initContainer = await initLoader.createDetachedContainer(provider.defaultCodeDetails);
                await initContainer.attach(provider.driver.createCreateNewRequest(provider.documentId));
                containerUrl = initContainer.resolvedUrl;

                const initDataObject = await requestFluidObject<ITestFluidObject>(initContainer, "default");
                for(let i = 0; i < maxOps; i++) {
                    initDataObject.root.set(i.toString(), i);
                }
                if(initContainer.isDirty) {
                    await timeoutPromise(
                        (res)=>initContainer.once("saved", ()=>res()),
                        {durationMs: this.timeout() / 2,errorMsg:"Not saved before timeout"});
                }
                initContainer.close();
            }

            // if we want there to be a summary before we load the storage only container
            // wait for it here
            if(testConfig.waitForSummary) {
                const summaryLoader = createLoader(
                    [[provider.defaultCodeDetails, provider.createFluidEntryPoint({
                        ...testContainerConfig,
                        runtimeOptions:{
                            ... testContainerConfig.runtimeOptions,
                            summaryOptions:{
                                ... testContainerConfig.runtimeOptions?.summaryOptions,
                                disableSummaries: false,
                            },
                        },
                    })]],
                    provider.documentServiceFactory,
                    provider.urlResolver,
                );
                const summaryContainer = await summaryLoader.resolve({
                    url: await provider.driver.createContainerUrl(provider.documentId, containerUrl),
                });

                const summaryCollection =
                    new SummaryCollection(summaryContainer.deltaManager, new TelemetryNullLogger());

                await timeoutPromise(
                    (res)=>summaryCollection.once("summaryAck", ()=>res()),
                    {durationMs: this.timeout() / 2,errorMsg:"Not summary acked before timeout"});
                summaryContainer.close();
            }

            // spin up a validation (normal) and a storage only client, and check that they see the same things
            {
                const validationLoader = createLoader(
                    [[provider.defaultCodeDetails, provider.createFluidEntryPoint(testContainerConfig)]],
                    provider.documentServiceFactory,
                    provider.urlResolver,
                );
                const validationContainer = await validationLoader.resolve({
                    url: await provider.driver.createContainerUrl(provider.documentId, containerUrl),
                });
                const validationDataObject = await requestFluidObject<ITestFluidObject>(validationContainer, "default");

                const storageOnlyDsF: IDocumentServiceFactory = {
                    createContainer:
                        provider.documentServiceFactory.createContainer.bind(provider.documentServiceFactory),
                    protocolName: provider.documentServiceFactory.protocolName,
                    createDocumentService: async (resolvedUrl: IResolvedUrl, logger?: ITelemetryBaseLogger)=> new Proxy(
                            await provider.documentServiceFactory.createDocumentService(resolvedUrl,logger),
                            {
                                get: (target,prop: keyof IDocumentService,r)=> {
                                    if(prop === "policies") {
                                        const policies: IDocumentService["policies"] = {
                                            ... target.policies,
                                            storageOnly: true,
                                        };
                                        return policies;
                                    }
                                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                                    return Reflect.get(target, prop,r);
                                },
                            }),
                };

                const storageOnlyLoader = createLoader(
                    [[provider.defaultCodeDetails, provider.createFluidEntryPoint(testContainerConfig)]],
                    storageOnlyDsF,
                    provider.urlResolver,
                );

                const storageOnlyContainer = await storageOnlyLoader.resolve({
                    url: await provider.driver.createContainerUrl(provider.documentId, containerUrl),
                    headers: {[LoaderHeader.loadMode]: testConfig.loadOptions},
                }) as Container;

                storageOnlyContainer.resume();
                const deltaManager = storageOnlyContainer.deltaManager;
                assert.strictEqual(deltaManager.active, false, "deltaManager.active");
                assert.ok(deltaManager.readOnlyInfo.readonly, "deltaManager.readOnlyInfo.readonly");
                assert.ok(deltaManager.readOnlyInfo.permissions, "deltaManager.readOnlyInfo.permissions");
                assert.ok(deltaManager.readOnlyInfo.storageOnly, "deltaManager.readOnlyInfo.storageOnly");

                const storageOnlyDataObject =
                    await requestFluidObject<ITestFluidObject>(storageOnlyContainer, "default");

                for(const key of validationDataObject.root.keys()) {
                    assert.strictEqual(
                        storageOnlyDataObject.root.get(key),
                        validationDataObject.root.get(key));
                }
            }
        });
    }
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import type { ISharedMap } from "@fluidframework/map";
import { IDocumentMessage, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import { FlushMode, FlushModeExperimental } from "@fluidframework/runtime-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
describeCompat("Fewer batches", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap } = apis.dds;

	const mapId = "mapId";
	const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	let provider: ITestObjectProvider;
	const capturedBatches: IDocumentMessage[][] = [];

	beforeEach("setup", () => {
		provider = getTestObjectProvider();
		capturedBatches.splice(0);
	});
	afterEach(async () => provider.reset());

	let localContainer: IContainer;
	let remoteContainer: IContainer;
	let dataObject1: ITestFluidObject;
	let dataObject2: ITestFluidObject;
	let dataObject1map: ISharedMap;
	let dataObject2map: ISharedMap;

	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => {
		return {
			getRawConfig: (name: string): ConfigTypes => settings[name],
		};
	};

	const setupContainers = async (
		containerConfig: ITestContainerConfig,
		featureGates: Record<string, ConfigTypes> = {},
	) => {
		const configWithFeatureGates = {
			...containerConfig,
			loaderProps: { configProvider: configProvider(featureGates) },
		};

		// Create a Container for the first client.
		localContainer = await provider.makeTestContainer(configWithFeatureGates);
		dataObject1 = (await localContainer.getEntryPoint()) as ITestFluidObject;
		dataObject1map = await dataObject1.getSharedObject<ISharedMap>(mapId);

		// Load the Container that was created by the first client.
		remoteContainer = await provider.loadTestContainer(configWithFeatureGates);
		dataObject2 = (await remoteContainer.getEntryPoint()) as ITestFluidObject;
		dataObject2map = await dataObject2.getSharedObject<ISharedMap>(mapId);
		await waitForContainerConnection(localContainer);
		await waitForContainerConnection(remoteContainer);

		localContainer.deltaManager.outbound.on("op", (batch: IDocumentMessage[]) => {
			capturedBatches.push(batch);
		});
		await provider.ensureSynchronized();
	};

	[
		{
			flushMode: FlushMode.TurnBased,
			batchCount: 5,
		},
		{
			flushMode: FlushMode.Immediate,
			batchCount: 5,
		},
		{
			flushMode: FlushModeExperimental.Async as unknown as FlushMode,
			batchCount: 1,
		},
	].forEach((test) => {
		it(`With runtime flushMode=FlushMode.${
			FlushMode[test.flushMode] ?? FlushModeExperimental[test.flushMode]
		}, ops across JS turns produce ${test.batchCount} batches`, async () => {
			await setupContainers({
				...testContainerConfig,
				runtimeOptions: {
					flushMode: test.flushMode,
				},
			});

			// Force the container into write-mode
			dataObject1map.set("key0", "0");
			await provider.ensureSynchronized();

			// Ignore the batch we just sent
			capturedBatches.splice(0);

			const opCount = 5;
			dataObject1map.set("key1", "1");

			await Promise.resolve().then(async () => {
				dataObject1map.set("key2", "2");
			});
			await Promise.resolve().then(async () => {
				dataObject1map.set("key3", "3");
			});
			await Promise.resolve().then(async () => {
				dataObject1map.set("key4", "4");
				await Promise.resolve().then(async () => {
					dataObject1map.set("key5", "5");
				});
			});

			await provider.ensureSynchronized();

			assert.strictEqual(capturedBatches.length, test.batchCount);

			for (let i = 1; i <= opCount; i++) {
				const value = dataObject2map.get(`key${i}`);
				assert.strictEqual(value, `${i}`, `Wrong value for key${i}`);
			}
		});
	});

	const expectedErrors = [
		{
			eventName: "fluid:telemetry:ContainerRuntime:Outbox:ReferenceSequenceNumberMismatch",
			error: "Submission of an out of order message",
		},
		// A container will not close when an out of order message was detected.
		// The error below is due to the artificial repro of interleaving op processing and flushing
		{
			eventName: "fluid:telemetry:Container:ContainerClose",
			error: "Found a non-Sequential sequenceNumber",
		},
	];

	itExpects(
		"Reference sequence number mismatch when doing op reentry - early flush enabled - submits two batches",
		expectedErrors,
		async () => {
			// By default, we would flush a batch when we detect a reference sequence number mismatch
			await processOutOfOrderOp({});
			assert.strictEqual(capturedBatches.length, 2);
		},
	);

	itExpects(
		"Reference sequence number mismatch when doing op reentry - early flush disabled - submits one batch",
		expectedErrors,
		async () => {
			await processOutOfOrderOp({ "Fluid.ContainerRuntime.DisablePartialFlush": true });
			assert.strictEqual(capturedBatches.length, 1);
		},
	);

	/**
	 * With `FlushMode.TurnBased`, the container will schedule a flush at the end of the JS turn.
	 * There is a possibility that the DeltaManager's inbound queue to schedule processing in-between the op getting
	 * create and the flush being scheduled. This function attempts to recreate that scenario artificially.
	 *
	 * @param containerConfig - the test container configuration
	 */
	const processOutOfOrderOp = async (featureGates: Record<string, ConfigTypes> = {}) => {
		await setupContainers(testContainerConfig, featureGates);

		// Force the containers into write-mode
		dataObject1map.set("Force write", "0");
		dataObject2map.set("Force write", "0");
		await provider.ensureSynchronized();

		// Ignore the batch we just sent
		capturedBatches.splice(0);

		assert(localContainer.clientId !== undefined);
		const op: ISequencedDocumentMessage = {
			clientId: localContainer.clientId,
			clientSequenceNumber: 1,
			contents: {
				type: "component",
				contents: {
					address: "default",
					contents: {
						content: {
							address: mapId,
							contents: {
								key: "mockKey",
								type: "set",
								value: {
									type: "Plain",
									value: "value3",
								},
							},
						},
						type: "op",
					},
				},
			},
			metadata: { batch: true },
			minimumSequenceNumber: 0,
			referenceSequenceNumber: 2,
			sequenceNumber: 3,
			timestamp: 1675197275171,
			type: "op",
			expHash1: "4d1a6431",
		};

		// Queue a microtask to process the above op.
		Promise.resolve()
			.then(() => {
				(localContainer.deltaManager as any).lastProcessedSequenceNumber += 1;
				(dataObject1.context.containerRuntime as ContainerRuntime).process(op, false);
				dataObject1map.set("key2", "value2");
			})
			.catch(() => {});

		dataObject1map.set("key1", "value1");
		// Wait for the ops to get processed by both the containers.
		await provider.ensureSynchronized();
	};
});

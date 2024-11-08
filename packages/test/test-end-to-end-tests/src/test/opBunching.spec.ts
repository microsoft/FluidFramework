/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { ISharedDirectory, ISharedMap } from "@fluidframework/map/internal";
import type { IRuntimeMessageCollection } from "@fluidframework/runtime-definitions/internal";
import { SharedObject } from "@fluidframework/shared-object-base/internal";
import { ITestObjectProvider } from "@fluidframework/test-utils/internal";
import { createSandbox } from "sinon";

describeCompat(
	"Ops for DDSes are bunched together",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const { DataObject, DataObjectFactory } = apis.dataRuntime;
		const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;
		const { SharedMap } = apis.dds;

		class TestDataObject extends DataObject {
			public get _context() {
				return this.context;
			}
			public get _runtime() {
				return this.runtime;
			}
			public get _root() {
				return this.root;
			}
		}

		const dataObjectFactory = new DataObjectFactory(
			"testDataObject",
			TestDataObject,
			[SharedMap.getFactory()],
			undefined,
		);
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: dataObjectFactory,
			registryEntries: [["testDataObject", Promise.resolve(dataObjectFactory)]],
		});

		type SharedObjectWithProcess = Omit<SharedObject, "processMessages"> & {
			processMessages(messageCollection: IRuntimeMessageCollection): void;
		};

		let sandbox: sinon.SinonSandbox;
		let provider: ITestObjectProvider;
		let rootDataObject: TestDataObject;
		let dds1: ISharedDirectory;
		let dds2: ISharedMap;
		let ds2dds1: ISharedDirectory;
		let dds1Container2Stub: sinon.SinonStub;
		let dds2Container2Stub: sinon.SinonStub;
		let ds2dds1Container2Stub: sinon.SinonStub;

		beforeEach("getTestObjectProvider", async () => {
			sandbox = createSandbox();
			provider = getTestObjectProvider();

			const container = await provider.createContainer(runtimeFactory);
			rootDataObject = (await container.getEntryPoint()) as TestDataObject;
			dds1 = rootDataObject._root;
			dds2 = SharedMap.create(rootDataObject._runtime);
			dds1.set("map", dds2.handle);

			const ds2 = await dataObjectFactory.createInstance(
				rootDataObject._context.containerRuntime,
			);
			dds1.set("dataStore2", ds2.handle);

			const container2 = await provider.loadContainer(runtimeFactory);
			const rootObject2 = (await container2.getEntryPoint()) as TestDataObject;
			const dds1Container2 = rootObject2._root as unknown as SharedObjectWithProcess;

			await provider.ensureSynchronized();
			const dds2Handle = rootObject2._root.get<IFluidHandle<SharedObjectWithProcess>>("map");
			assert(dds2Handle !== undefined, "shared map handle not found");
			const dds2Container2 = await dds2Handle.get();

			const ds2Container2Handle =
				rootObject2._root.get<IFluidHandle<TestDataObject>>("dataStore2");
			assert(ds2Container2Handle !== undefined, "data store 2 handle not found");
			const ds2Container2 = await ds2Container2Handle.get();
			const ds2dds1Container2 = ds2Container2._root as unknown as SharedObjectWithProcess;
			ds2dds1 = ds2Container2._root;

			dds1Container2Stub = sandbox.stub(dds1Container2, "processMessages");
			dds2Container2Stub = sandbox.stub(dds2Container2, "processMessages");
			ds2dds1Container2Stub = sandbox.stub(ds2dds1Container2, "processMessages");
		});

		afterEach(() => {
			sandbox.restore();
		});

		it("ops for a single DDS", async () => {
			// Send a bunch of ops for dds2.
			const bunchCount = 5;
			for (let i = 0; i < bunchCount; i++) {
				dds2.set(i.toString(), i);
			}

			// Send another bunch of ops for dds2 without interleaving.
			for (let i = bunchCount; i < 2 * bunchCount; i++) {
				dds2.set(i.toString(), i);
			}

			await provider.ensureSynchronized();

			// Validate that processMessages is called once with all ops.
			assert(dds2Container2Stub.calledOnce, "processMessages should be called once");
			const messageCollection = dds2Container2Stub.args[0][0] as IRuntimeMessageCollection;
			assert.strictEqual(
				messageCollection.messagesContent.length,
				2 * bunchCount,
				"All the ops for dds2 should be processed together",
			);
		});

		it("ops across two DDSes interleaved", async () => {
			// Send first bunch of ops for dds2.
			const bunch1dds2Count = 5;
			for (let i = 0; i < bunch1dds2Count; i++) {
				dds2.set(i.toString(), i);
			}

			// Send second bunch of ops for dds1.
			const bunch2dds1Count = 10;
			for (let i = 0; i < bunch2dds1Count; i++) {
				dds1.set(i.toString(), i);
			}

			// Send third bunch of ops for dds2.
			const bunch3dds2Count = 5;
			for (let i = 0; i < bunch3dds2Count; i++) {
				dds2.set(i.toString(), i);
			}

			await provider.ensureSynchronized();

			assert(dds1Container2Stub.calledOnce, "processMessages should be called once on dds1");
			assert(dds2Container2Stub.calledTwice, "processMessages should be called twice on dds2");

			const messageCollection1 = dds2Container2Stub.args[0][0] as IRuntimeMessageCollection;
			assert.strictEqual(
				messageCollection1.messagesContent.length,
				bunch1dds2Count,
				"First bunch of ops for dds2 should be processed together",
			);

			const messageCollection2 = dds1Container2Stub.args[0][0] as IRuntimeMessageCollection;
			assert.strictEqual(
				messageCollection2.messagesContent.length,
				bunch2dds1Count,
				"First bunch of ops for dds1 should be processed together",
			);

			const messageCollection3 = dds2Container2Stub.args[1][0] as IRuntimeMessageCollection;
			assert.strictEqual(
				messageCollection3.messagesContent.length,
				bunch3dds2Count,
				"Second bunch of ops for dds2 should be processed together",
			);
		});

		it("ops across two data store interleaved", async () => {
			// Send first bunch of ops for dds1 in data store 1.
			const bunch1dds1Count = 5;
			for (let i = 0; i < bunch1dds1Count; i++) {
				dds1.set(i.toString(), i);
			}

			// Send second bunch of ops for dds1 in data store 2.
			const bunch2ds2dds1Count = 10;
			for (let i = 0; i < bunch2ds2dds1Count; i++) {
				ds2dds1.set(i.toString(), i);
			}

			// Send third bunch of ops for dds2 in data store 1.
			const bunch3dds2Count = 15;
			for (let i = 0; i < bunch3dds2Count; i++) {
				dds2.set(i.toString(), i);
			}

			await provider.ensureSynchronized();

			assert(dds1Container2Stub.calledOnce, "processMessages should be called once on dds1");
			assert(dds2Container2Stub.calledOnce, "processMessages should be called once on dds2");
			assert(
				ds2dds1Container2Stub.calledOnce,
				"processMessages should be called once on ds2's dds1",
			);

			const messageCollection1 = dds1Container2Stub.args[0][0] as IRuntimeMessageCollection;
			assert.strictEqual(
				messageCollection1.messagesContent.length,
				bunch1dds1Count,
				"First bunch of ops for dds2 should be processed together",
			);

			const messageCollection2 = ds2dds1Container2Stub.args[0][0] as IRuntimeMessageCollection;
			assert.strictEqual(
				messageCollection2.messagesContent.length,
				bunch2ds2dds1Count,
				"First bunch of ops for dds1 should be processed together",
			);

			const messageCollection3 = dds2Container2Stub.args[0][0] as IRuntimeMessageCollection;
			assert.strictEqual(
				messageCollection3.messagesContent.length,
				bunch3dds2Count,
				"Second bunch of ops for dds2 should be processed together",
			);
		});

		it("ops for DDS and other types interleaved", async () => {
			// Send first bunch of ops for dds1.
			const bunch1dds1Count = 5;
			for (let i = 0; i < bunch1dds1Count; i++) {
				dds1.set(i.toString(), i);
			}

			// Send an attach op. This will send an attach op for the new data store + an
			// op for dds1 after that for setting the handle.
			const ds3 = await dataObjectFactory.createInstance(
				rootDataObject._context.containerRuntime,
			);
			dds1.set("dataStore3", ds3.handle);

			// Send second bunch of ops for dds1. Send 1 less than bunch2dds1Count because one op
			// is already sent above.
			const bunch2dds1Count = 10;
			for (let i = 0; i < bunch2dds1Count - 1; i++) {
				dds1.set(i.toString(), i);
			}

			// Send a blob attach op. This will send an attach op for the new data store + an
			// op for dds1 after that for setting the handle.
			const blobContents = "Blob contents";
			const blobHandle = await rootDataObject._context.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);
			dds1.set("blob", blobHandle);

			// Send third bunch of ops for dds1. Send 1 less than bunch3dds1Count because one op
			// is already sent above.
			const bunch3dds1Count = 15;
			for (let i = 0; i < bunch3dds1Count - 1; i++) {
				dds1.set(i.toString(), i);
			}

			await provider.ensureSynchronized();

			assert(
				dds1Container2Stub.calledThrice,
				"processMessages should be called thrice on dds1",
			);

			const messageCollection1 = dds1Container2Stub.args[0][0] as IRuntimeMessageCollection;
			assert.strictEqual(
				messageCollection1.messagesContent.length,
				bunch1dds1Count,
				"First bunch of ops for dds1 should be processed together",
			);

			const messageCollection2 = dds1Container2Stub.args[1][0] as IRuntimeMessageCollection;
			assert.strictEqual(
				messageCollection2.messagesContent.length,
				bunch2dds1Count,
				"Second bunch of ops for dds1 should be processed together",
			);

			const messageCollection3 = dds1Container2Stub.args[2][0] as IRuntimeMessageCollection;
			assert.strictEqual(
				messageCollection3.messagesContent.length,
				bunch3dds1Count,
				"Second bunch of ops for dds1 should be processed together",
			);
		});
	},
);

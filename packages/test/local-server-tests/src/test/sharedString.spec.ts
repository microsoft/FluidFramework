/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/internal";
import { type IRuntimeFactory } from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";
import { IFluidHandle, type FluidObject } from "@fluidframework/core-interfaces/internal";
import {
	SharedString,
	TextSegment,
	type ISharedString,
} from "@fluidframework/sequence/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";

import { createLoader } from "../utils.js";

class RootDataObject extends DataObject {
	get RootDataObject() {
		return this;
	}

	public sharedString: ISharedString = SharedString.create(this.runtime);

	protected async initializingFirstTime(props?: any): Promise<void> {
		this.sharedString.insertText(0, "hello world");
		this.root.set("sharedString", this.sharedString.handle);
	}
	protected async hasInitialized(): Promise<void> {
		const sharedString = await this.root
			.get<IFluidHandle<ISharedString>>("sharedString")
			?.get();

		assert(sharedString !== undefined, "sharedString handle not in root");
		this.sharedString = sharedString;
	}
}

const parentDataObjectFactory = new DataObjectFactory(
	"RootDataObject",
	RootDataObject,
	[SharedString.getFactory()],
	{},
);

// a simple container runtime factory with a single datastore aliased as default.
// the default datastore is also returned as the entrypoint
const runtimeFactory: IRuntimeFactory = {
	get IRuntimeFactory() {
		return this;
	},
	instantiateRuntime: async (context, existing) => {
		return loadContainerRuntime({
			context,
			existing,
			registryEntries: [
				[
					parentDataObjectFactory.type,
					// the parent is still async in the container registry
					// this allows things like code splitting for dynamic loading
					Promise.resolve(parentDataObjectFactory),
				],
			],
			provideEntryPoint: async (rt) => {
				const maybeRoot = await rt.getAliasedDataStoreEntryPoint("default");
				if (maybeRoot === undefined) {
					const ds = await rt.createDataStore(parentDataObjectFactory.type);
					await ds.trySetAlias("default");
				}
				const root = await rt.getAliasedDataStoreEntryPoint("default");
				assert(root !== undefined, "default must exist");
				return root.get();
			},
		});
	},
};

describe("Scenario Test", () => {
	it("asdsadsa", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const { loaderProps, urlResolver } = createLoader({
			runtimeFactory,
			deltaConnectionServer,
		});
		const codeDetails = { package: "test" };
		const detachedContainer = await createDetachedContainer({
			...loaderProps,
			codeDetails,
		});
		const detachedEntryPoint: FluidObject<RootDataObject> | undefined =
			await detachedContainer.getEntryPoint();

		assert(
			detachedEntryPoint.RootDataObject !== undefined,
			"detachedEntryPoint not RootDataObject",
		);
		await detachedContainer.attach(urlResolver.createCreateNewRequest("test"));
		const url = await detachedContainer.getAbsoluteUrl("");
		assert(url !== undefined, "url must be defined");
		detachedContainer.dispose();

		const load = async () => {
			const loader = createLoader({ runtimeFactory, deltaConnectionServer });

			const container = await loadExistingContainer({
				...loader.loaderProps,
				request: { url },
			});

			const entryPoint: FluidObject<RootDataObject> | undefined =
				await container.getEntryPoint();
			assert(entryPoint.RootDataObject !== undefined, "entryPoint not RootDataObject");
			const sharedString = entryPoint.RootDataObject.sharedString;
			sharedString.insertText(0, " ");
			await new Promise((resolve) => container.once("saved", resolve));
			return { container, sharedString: entryPoint.RootDataObject.sharedString };
		};

		const c2 = await load();

		c2.sharedString.on("sequenceDelta", (e) => {
			const firstSeg = e.first.segment;
			if (TextSegment.is(firstSeg) && firstSeg.text.startsWith("5")) {
				c2.sharedString.insertText(c2.sharedString.getLength(), "reentrant");
			}
		});

		const c1 = await load();
		for (let i = 0; i < 10; i++) {
			c1.sharedString.insertText(0, i.toString());
		}

		assert.notStrictEqual(
			c1.sharedString.getText(),
			c2.sharedString.getText(),
			"should be different before sync",
		);

		await Promise.all([
			new Promise((resolve) => c1.container.once("saved", resolve)),
			new Promise((resolve) => c2.container.once("saved", resolve)),
		]);

		assert.strictEqual(
			c1.sharedString.getText(),
			c2.sharedString.getText(),
			"should be same after sync",
		);
	});
});

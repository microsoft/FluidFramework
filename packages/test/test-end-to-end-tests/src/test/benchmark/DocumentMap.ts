/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-nodejs-modules
import * as crypto from "crypto";
import { strict as assert } from "assert";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import { SharedMap, type ISharedMap } from "@fluidframework/map";
import {
	ChannelFactoryRegistry,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils";
import {
	ConfigTypes,
	IConfigProviderBase,
	IFluidHandle,
	IRequest,
} from "@fluidframework/core-interfaces";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";

import {
	CompressionAlgorithms,
	ContainerRuntime,
	IContainerRuntimeOptions,
	ISummarizer,
} from "@fluidframework/container-runtime";
import { assertDocumentTypeInfo, isDocumentMapInfo } from "@fluid-private/test-version-utils";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import {
	IDocumentLoaderAndSummarizer,
	IDocumentProps,
	ISummarizeResult,
} from "./DocumentCreator.js";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

const featureGates = {
	"Fluid.Driver.Odsp.TestOverride.DisableSnapshotCache": true,
};

const defaultDataStoreId = "default";
const mapId = "mapId";
const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
const maxMessageSizeInBytes = 1 * 1024 * 1024; // 1MB
const generateRandomStringOfSize = (sizeInBytes: number): string =>
	crypto.randomBytes(sizeInBytes / 2).toString("hex");

function setMapKeys(map: ISharedMap, count: number, item: string): void {
	for (let i = 0; i < count; i++) {
		map.set(`key${i}`, item);
	}
}

function validateMapKeys(map: ISharedMap, count: number, expectedSize: number): void {
	for (let i = 0; i < count; i++) {
		const value = map.get(`key${i}`);
		assert(value !== undefined);
		assert(value.length === expectedSize);
	}
}

class TestDataObject extends DataObject {
	public get _root() {
		return this.root;
	}

	public get _runtime() {
		return this.runtime;
	}

	public get _context() {
		return this.context;
	}

	private readonly mapKey = mapId;
	public map!: ISharedMap;

	protected async initializingFirstTime() {
		const sharedMap = SharedMap.create(this.runtime, this.mapKey);
		this.root.set(this.mapKey, sharedMap.handle);
	}

	protected async hasInitialized() {
		const mapHandle = this.root.get<IFluidHandle<ISharedMap>>(this.mapKey);
		assert(mapHandle !== undefined, "SharedMap not found");
		this.map = await mapHandle.get();
	}
}

const runtimeOptions: IContainerRuntimeOptions = {
	summaryOptions: {
		summaryConfigOverrides: {
			state: "disabled",
		},
	},
	compressionOptions: {
		minimumBatchSizeInBytes: 1024 * 1024,
		compressionAlgorithm: CompressionAlgorithms.lz4,
	},
	chunkSizeInBytes: 600 * 1024,
};

export class DocumentMap implements IDocumentLoaderAndSummarizer {
	private readonly keysInMap: number;
	private readonly sizeOfItemMb: number;
	private _mainContainer: IContainer | undefined;
	private containerRuntime: ContainerRuntime | undefined;
	private mainDataStore: TestDataObject | undefined;
	private readonly _dataObjectFactory: DataObjectFactory<TestDataObject>;
	public get dataObjectFactory() {
		return this._dataObjectFactory;
	}
	private readonly runtimeFactory: ContainerRuntimeFactoryWithDefaultDataStore;
	public get logger(): ITelemetryLoggerExt | undefined {
		return this.props.logger;
	}
	public get mainContainer(): IContainer | undefined {
		return this._mainContainer;
	}

	/**
	 * Creates a new DocumentCreator using configuration parameters.
	 * @param props - Properties for initializing the Document Creator.
	 */
	public constructor(private readonly props: IDocumentProps) {
		assertDocumentTypeInfo(this.props.documentTypeInfo, this.props.documentType);
		// Now TypeScript knows that info.documentTypeInfo is either DocumentMapInfo or DocumentMultipleDataStoresInfo
		// and info.documentType is either "DocumentMap" or "DocumentMultipleDataStores"
		assert(isDocumentMapInfo(this.props.documentTypeInfo));

		this._dataObjectFactory = new DataObjectFactory(
			"TestDataObject",
			TestDataObject,
			[SharedMap.getFactory(), SharedMap.getFactory()],
			[],
		);
		this.runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: this.dataObjectFactory,
			registryEntries: [
				[this.dataObjectFactory.type, Promise.resolve(this.dataObjectFactory)],
			],
			runtimeOptions,
		});
		switch (this.props.documentType) {
			case "DocumentMap":
				this.keysInMap = this.props.documentTypeInfo.numberOfItems;
				this.sizeOfItemMb = this.props.documentTypeInfo.itemSizeMb;
				break;
			default:
				throw new Error("Invalid document type");
		}
	}

	private async populateMap() {
		assert(
			this._mainContainer !== undefined,
			"Container should be initialized before creating data stores",
		);
		assert(
			this.mainDataStore !== undefined,
			"mainDataStore should be initialized before creating data stores",
		);

		const mapHandle = this.mainDataStore._root.get(mapId);
		assert(mapHandle !== undefined, "map not found");
		const map = await mapHandle.get();
		const largeString = generateRandomStringOfSize(maxMessageSizeInBytes * this.sizeOfItemMb);
		setMapKeys(map, this.keysInMap, largeString);
		validateMapKeys(map, this.keysInMap, maxMessageSizeInBytes * this.sizeOfItemMb);
	}

	private async ensureContainerConnectedWriteMode(container: IContainer): Promise<void> {
		const resolveIfActive = (res: () => void) => {
			if (container.deltaManager.active) {
				res();
			}
		};
		const containerConnectedHandler = (_clientId: string): void => {};

		if (!container.deltaManager.active) {
			await new Promise<void>((resolve) =>
				container.on("connected", () => resolveIfActive(resolve)),
			);
			container.off("connected", containerConnectedHandler);
		}
	}

	private async waitForContainerSave(c: IContainer) {
		if (!c.isDirty) {
			return;
		}
		await new Promise<void>((resolve) => c.on("saved", () => resolve()));
	}

	public async initializeDocument() {
		const loader = this.props.provider.createLoader(
			[[this.props.provider.defaultCodeDetails, this.runtimeFactory]],
			{ logger: this.props.logger, configProvider: configProvider(featureGates) },
		);
		this._mainContainer = await loader.createDetachedContainer(
			this.props.provider.defaultCodeDetails,
		);
		this.props.provider.updateDocumentId(this._mainContainer.resolvedUrl);
		this.mainDataStore = (await this._mainContainer.getEntryPoint()) as TestDataObject;
		this.mainDataStore._root.set("mode", "write");
		await this.populateMap();
		await this._mainContainer.attach(
			this.props.provider.driver.createCreateNewRequest(this.props.provider.documentId),
		);
		await this.waitForContainerSave(this._mainContainer);
		this.containerRuntime = this.mainDataStore._context.containerRuntime as ContainerRuntime;

		if (this._mainContainer.deltaManager.active) {
			await this.ensureContainerConnectedWriteMode(this._mainContainer);
		}
	}

	public async loadDocument(): Promise<IContainer> {
		const requestUrl = await this.props.provider.driver.createContainerUrl(
			this.props.provider.documentId,
			this._mainContainer?.resolvedUrl,
		);
		const request: IRequest = {
			headers: {
				[LoaderHeader.cache]: false,
			},
			url: requestUrl,
		};
		const loader = this.props.provider.createLoader(
			[[this.props.provider.defaultCodeDetails, this.runtimeFactory]],
			{ logger: this.props.logger, configProvider: configProvider(featureGates) },
		);
		const container2 = await loader.resolve(request);

		await this.props.provider.ensureSynchronized();
		const dataStore = (await container2.getEntryPoint()) as TestDataObject;

		const mapHandle = dataStore._root.get(mapId);
		assert(mapHandle !== undefined, "map not found");
		const map = await mapHandle.get();
		validateMapKeys(map, this.keysInMap, maxMessageSizeInBytes * this.sizeOfItemMb);
		return container2;
	}

	private async waitForSummary(summarizer: ISummarizer): Promise<string> {
		// Wait for all pending ops to be processed by all clients.
		await this.props.provider.ensureSynchronized();
		const summaryResult = await summarizeNow(summarizer);
		return summaryResult.summaryVersion;
	}

	public async summarize(
		_container: IContainer,
		summaryVersion?: string,
		closeContainer: boolean = true,
	): Promise<ISummarizeResult> {
		try {
			assert(_container !== undefined, "Container should be initialized before summarize");
			const { container: containerClient, summarizer: summarizerClient } =
				await createSummarizerFromFactory(
					this.props.provider,
					_container,
					this.dataObjectFactory,
					summaryVersion,
					undefined,
					undefined,
					this.logger,
					configProvider(featureGates),
				);

			const newSummaryVersion = await this.waitForSummary(summarizerClient);
			assert(newSummaryVersion !== undefined, "summaryVersion needs to be valid.");
			if (closeContainer) {
				summarizerClient.close();
			}
			return {
				container: containerClient,
				summarizer: summarizerClient,
				summaryVersion: newSummaryVersion,
			};
		} catch (error: any) {
			throw new Error(`Error Summarizing ${error}`);
		}
	}
}

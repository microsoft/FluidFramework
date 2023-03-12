/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
	ContainerRuntime,
	IContainerRuntimeOptions,
	ISummarizer,
} from "@fluidframework/container-runtime";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import { SharedMap } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IContainer } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import {
	createAndAttachContainer,
	createLoader,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { IDocumentLoaderAndSummarizer, IDocumentProps, ISummarizeResult } from "./DocumentCreator";

class TestDataObject extends DataObject {
	public get _root() {
		return this.root;
	}

	public get _context() {
		return this.context;
	}

	private readonly mapKey = "map";
	public map!: SharedMap;

	private readonly sharedStringKey = "sharedString";
	public sharedString!: SharedString;

	protected async initializingFirstTime() {
		const sharedMap = SharedMap.create(this.runtime);
		this.root.set(this.mapKey, sharedMap.handle);

		const sharedString = SharedString.create(this.runtime);
		this.root.set(this.sharedStringKey, sharedString.handle);
	}

	protected async hasInitialized() {
		const mapHandle = this.root.get<IFluidHandle<SharedMap>>(this.mapKey);
		assert(mapHandle !== undefined, "SharedMap not found");
		this.map = await mapHandle.get();

		const sharedStringHandle = this.root.get<IFluidHandle<SharedString>>(this.sharedStringKey);
		assert(sharedStringHandle !== undefined, "SharedMatrix not found");
		this.sharedString = await sharedStringHandle.get();
	}
}

const runtimeOptions: IContainerRuntimeOptions = {
	summaryOptions: {
		summaryConfigOverrides: {
			state: "disabled",
		},
	},
};

// implement IDocumentLoader methods
export class DocumentMultipleDds implements IDocumentLoaderAndSummarizer {
	private _mainContainer: IContainer | undefined;
	private containerRuntime: ContainerRuntime | undefined;
	private mainDataStore: TestDataObject | undefined;
	private readonly dsCounts: number;
	private readonly dsCountPerIteration: number;
	private readonly _dataObjectFactory: DataObjectFactory<TestDataObject>;
	public get dataObjectFactory() {
		return this._dataObjectFactory;
	}
	private readonly runtimeFactory: ContainerRuntimeFactoryWithDefaultDataStore;

	public get mainContainer(): IContainer | undefined {
		return this._mainContainer;
	}

	public get logger(): ITelemetryLogger | undefined {
		return this.props.logger;
	}

	private async ensureContainerConnectedWriteMode(container: Container): Promise<void> {
		const resolveIfActive = (res: () => void) => {
			if (container.deltaManager.active) {
				res();
			}
		};
		if (!container.deltaManager.active) {
			await new Promise<void>((resolve) =>
				container.on("connected", () => resolveIfActive(resolve)),
			);
			container.off("connected", resolveIfActive);
		}
	}

	private async createDataStores() {
		assert(
			this._mainContainer !== undefined,
			"Container should be initialized before creating data stores",
		);
		assert(
			this.containerRuntime !== undefined,
			"ContainerRuntime should be initialized before creating data stores",
		);
		assert(
			this.mainDataStore !== undefined,
			"mainDataStore should be initialized before creating data stores",
		);
		const totalIterations = this.dsCounts / this.dsCountPerIteration;
		for (let i = 0; i < totalIterations; i++) {
			for (let j = 0; j < this.dsCountPerIteration; j++) {
				const dataStore = await this.dataObjectFactory.createInstance(
					this.containerRuntime,
				);
				this.mainDataStore._root.set(`dataStore${j}`, dataStore.handle);
			}
			await this.waitForContainerSave(this._mainContainer);
		}
	}

	private async waitForContainerSave(c: IContainer) {
		if (!c.isDirty) {
			return;
		}
		await new Promise<void>((resolve) => c.on("saved", () => resolve()));
	}

	/**
	 * Creates a new DocumentCreator using configuration parameters.
	 * @param props - Properties for initializing the Document Creator.
	 * @param numberOfKeysInMap - Size of the document to be created 1=5Mb, 2=10Mb, etc.
	 */
	public constructor(private readonly props: IDocumentProps) {
		this._dataObjectFactory = new DataObjectFactory(
			"TestDataObject",
			TestDataObject,
			[SharedMap.getFactory(), SharedString.getFactory()],
			[],
		);
		this.runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
			this.dataObjectFactory,
			[[this.dataObjectFactory.type, Promise.resolve(this.dataObjectFactory)]],
			undefined,
			undefined,
			runtimeOptions,
		);

		switch (this.props.documentType) {
			case "MediumDocumentMultipleDDSs":
				this.dsCounts = 500;
				this.dsCountPerIteration = 500;
				break;
			case "LargeDocumentMultipleDDSs":
				this.dsCounts = 750;
				this.dsCountPerIteration = 375;
				break;
			default:
				throw new Error("Invalid document type");
		}
	}

	public async initializeDocument(): Promise<void> {
		this._mainContainer = await this.props.provider.createContainer(this.runtimeFactory);
		this.props.provider.updateDocumentId(this._mainContainer.resolvedUrl);
		this.mainDataStore = await requestFluidObject<TestDataObject>(this._mainContainer, "/");
		this.containerRuntime = this.mainDataStore._context.containerRuntime as ContainerRuntime;
		this.mainDataStore._root.set("mode", "write");
		await this.ensureContainerConnectedWriteMode(this._mainContainer as Container);
		await this.createDataStores();
	}

	/**
	 * The loadDocument in this particular scenario does not need to do anything
	 * as the goal is to simply measure the summarization data.
	 * @returns the main container.
	 */
	public async loadDocument(): Promise<IContainer> {
		const loader = createLoader(
			[[this.props.provider.defaultCodeDetails, this.runtimeFactory]],
			this.props.provider.documentServiceFactory,
			this.props.provider.urlResolver,
			this.props.logger,
		);
		return createAndAttachContainer(
			this.props.provider.defaultCodeDetails,
			loader,
			this.props.provider.driver.createCreateNewRequest(this.props.provider.documentId),
		);
	}

	private async waitForSummary(summarizer: ISummarizer): Promise<string> {
		// Wait for all pending ops to be processed by all clients.
		await this.props.provider.ensureSynchronized();
		const summaryResult = await summarizeNow(summarizer);
		return summaryResult.summaryVersion;
	}

	public async summarize(
		summaryVersion?: string,
		closeContainer: boolean = true,
	): Promise<ISummarizeResult> {
		assert(
			this._mainContainer !== undefined,
			"Container should be initialized before summarize",
		);
		const { container: containerClient, summarizer: summarizerClient } =
			await createSummarizerFromFactory(
				this.props.provider,
				this._mainContainer,
				this.dataObjectFactory,
				summaryVersion,
				undefined,
				undefined,
				this.logger,
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
	}
}

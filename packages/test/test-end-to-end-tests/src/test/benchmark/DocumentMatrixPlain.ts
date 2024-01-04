/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
	CompressionAlgorithms,
	ContainerRuntime,
	IContainerRuntimeOptions,
	ISummarizer,
} from "@fluidframework/container-runtime";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import { SharedMatrix } from "@fluidframework/matrix";
import {
	ConfigTypes,
	IConfigProviderBase,
	IFluidHandle,
	IRequest,
} from "@fluidframework/core-interfaces";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import {
	ChannelFactoryRegistry,
	ITestContainerConfig,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils";
import {
	DocumentMatrixPlainInfo,
	assertDocumentTypeInfo,
	isDocumentMatrixPlainInfo,
} from "@fluid-private/test-version-utils";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";
import { IDocumentLoaderAndSummarizer, IDocumentProps, ISummarizeResult } from "./DocumentCreator";

// Tests usually make use of the default data object provided by the test object provider.
// However, it only creates a single DDS and in these tests we create multiple (3) DDSes per data store.
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

	private readonly matrixKey = "matrix1";
	public matrix!: SharedMatrix;

	protected async initializingFirstTime() {
		const sharedMatrix = SharedMatrix.create(this.runtime, this.matrixKey);
		this.root.set(this.matrixKey, sharedMatrix.handle);
	}

	protected async hasInitialized() {
		const matrixHandle = this.root.get<IFluidHandle<SharedMatrix>>(this.matrixKey);
		assert(matrixHandle !== undefined, "SharedMatrix not found");
		this.matrix = await matrixHandle.get();
	}
}

const runtimeOptions: IContainerRuntimeOptions = {
	summaryOptions: {
		summaryConfigOverrides: {
			state: "disabled",
		},
	},
	gcOptions: { gcEnabled: false, disableGC: true, runGC: false },
	compressionOptions: {
		minimumBatchSizeInBytes: 1024 * 1024,
		compressionAlgorithm: CompressionAlgorithms.lz4,
	},
	chunkSizeInBytes: 600 * 1024,
};
const matrixId = "matrix1";
const registry: ChannelFactoryRegistry = [[matrixId, SharedMatrix.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
	registry,
	runtimeOptions,
	loaderProps: {},
};

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

const featureGates = {
	"Fluid.Driver.Odsp.TestOverride.DisableSnapshotCache": true,
};
const featureGatesWithGcOff = {
	"Fluid.GarbageCollection.RunGC": false,
	"Fluid.Driver.Odsp.TestOverride.DisableSnapshotCache": true,
};

export class DocumentMatrixPlain implements IDocumentLoaderAndSummarizer {
	private _mainContainer: IContainer | undefined;
	private containerRuntime: ContainerRuntime | undefined;
	private mainDataStore: TestDataObject | undefined;
	private readonly docInfo: DocumentMatrixPlainInfo;
	private readonly _dataObjectFactory: DataObjectFactory<TestDataObject>;
	public get dataObjectFactory() {
		return this._dataObjectFactory;
	}
	private readonly runtimeFactory: ContainerRuntimeFactoryWithDefaultDataStore;

	public get mainContainer(): IContainer | undefined {
		return this._mainContainer;
	}

	public get logger(): ITelemetryLoggerExt | undefined {
		return this.props.logger;
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

	private generateRandomString(length: number): string {
		let result = "";
		const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		const charactersLength = characters.length;
		for (let i = 0; i < length; i++) {
			result += characters.charAt(Math.floor(Math.random() * charactersLength));
		}
		return result;
	}

	private async waitForContainerSave(c: IContainer) {
		if (!c.isDirty) {
			return;
		}
		await new Promise<void>((resolve) => c.on("saved", () => resolve()));
	}

	/**
	 * Creates a new Document with Multiple DDSs using configuration parameters.
	 * @param props - Properties for initializing the Document Creator.
	 */
	public constructor(private readonly props: IDocumentProps) {
		this._dataObjectFactory = new DataObjectFactory(
			"TestDataObject",
			TestDataObject,
			[SharedMatrix.getFactory()],
			[],
		);
		this.runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: this.dataObjectFactory,
			registryEntries: [
				[this.dataObjectFactory.type, Promise.resolve(this.dataObjectFactory)],
			],
			runtimeOptions,
		});

		assertDocumentTypeInfo(this.props.documentTypeInfo, this.props.documentType);
		// Now TypeScript knows that info.documentTypeInfo is either DocumentMapInfo or DocumentMultipleDataStoresInfo
		// and info.documentType is either "DocumentMap" or "DocumentMultipleDataStores"
		assert(isDocumentMatrixPlainInfo(this.props.documentTypeInfo));

		switch (this.props.documentType) {
			case "DocumentMatrixPlain":
				this.docInfo = this.props.documentTypeInfo;

				assert(
					this.docInfo.rowSize > this.docInfo.beginRow &&
						this.docInfo.rowSize > this.docInfo.endRow &&
						this.docInfo.beginRow < this.docInfo.endRow,
					`Invalid combination Row Size (${this.docInfo.rowSize}), begin row (${this.docInfo.beginRow}) and end row (${this.docInfo.endRow}) `,
				);
				assert(
					this.docInfo.columnSize > this.docInfo.beginColumn &&
						this.docInfo.columnSize > this.docInfo.endColumn &&
						this.docInfo.beginColumn < this.docInfo.endColumn,
					`Invalid combination Column Size (${this.docInfo.columnSize}), begin column (${this.docInfo.beginColumn}) and end column (${this.docInfo.endColumn})`,
				);
				break;
			default:
				throw new Error("Invalid document type");
		}
	}

	/**
	 * Sets the corners of the given matrix.
	 */
	private setCorners(matrix: SharedMatrix) {
		matrix.setCell(this.docInfo.beginRow, this.docInfo.beginColumn, "TopLeft" as any);
		matrix.setCell(this.docInfo.beginRow, this.docInfo.endColumn, "TopRight" as any);
		matrix.setCell(this.docInfo.endRow, this.docInfo.endColumn, "BottomRight" as any);
		matrix.setCell(this.docInfo.endRow, this.docInfo.beginColumn, "BottomLeft" as any);
	}

	/**
	 * Checks the corners of the given matrix.
	 */
	private checkCorners(matrix: SharedMatrix) {
		assert.equal(matrix.getCell(this.docInfo.beginRow, this.docInfo.beginColumn), "TopLeft");
		assert.equal(matrix.getCell(this.docInfo.beginRow, this.docInfo.endColumn), "TopRight");
		assert.equal(matrix.getCell(this.docInfo.endRow, this.docInfo.endColumn), "BottomRight");
		assert.equal(matrix.getCell(this.docInfo.endRow, this.docInfo.beginColumn), "BottomLeft");
	}

	public async initializeDocument(): Promise<void> {
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

		const matrixHandle = this.mainDataStore._root.get("matrix1");
		assert(matrixHandle !== undefined, "SharedMatrix not found");
		const matrix = await matrixHandle.get();

		matrix.insertRows(0, this.docInfo.rowSize);
		matrix.insertCols(0, this.docInfo.columnSize);
		const randomString = this.generateRandomString(this.docInfo.stringSize);
		for (let i = this.docInfo.beginRow; i < this.docInfo.endRow; i++) {
			for (let j = this.docInfo.beginColumn; j < this.docInfo.endColumn; j++) {
				// 1/4 of the cells will have similar value
				const cellValue =
					Math.floor(Math.random() * 4) === 0
						? randomString
						: this.generateRandomString(this.docInfo.stringSize);
				matrix.setCell(i, j, cellValue);
				// const id = `${i.toString()}_${j.toString()}`;
				// const finalString = `${id}${randomString.substring(id.length)}`;
				// matrix.setCell(i, j, finalString);
			}
		}
		this.setCorners(matrix);
		await this._mainContainer.attach(
			this.props.provider.driver.createCreateNewRequest(this.props.provider.documentId),
		);
		await this.waitForContainerSave(this._mainContainer);
		this.containerRuntime = this.mainDataStore._context.containerRuntime as ContainerRuntime;

		if (this._mainContainer.deltaManager.active) {
			await this.ensureContainerConnectedWriteMode(this._mainContainer);
		}
	}

	/**
	 * The loadDocument in this particular scenario does not need to do anything
	 * as the goal is to simply measure the summarization data.
	 * @returns the main container.
	 */
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

		const matrixHandle = dataStore._root.get(matrixId);
		assert(matrixHandle !== undefined, "matrix not found");
		const matrix = await matrixHandle.get();
		this.checkCorners(matrix);
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
		closeContainer: boolean = false,
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
					this.docInfo.rowSize > 30000
						? configProvider(featureGatesWithGcOff)
						: configProvider(featureGates),
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

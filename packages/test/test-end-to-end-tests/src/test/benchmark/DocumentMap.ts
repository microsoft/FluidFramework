/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-nodejs-modules
import * as crypto from "crypto";
import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";
import { IContainer, IHostLoader, LoaderHeader } from "@fluidframework/container-definitions";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	ChannelFactoryRegistry,
	createSummarizer,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";
import { CompressionAlgorithms, ISummarizer } from "@fluidframework/container-runtime";
import { assertDocumentTypeInfo, isDocumentMapInfo } from "@fluid-internal/test-version-utils";
import { IDocumentLoaderAndSummarizer, IDocumentProps, ISummarizeResult } from "./DocumentCreator";

const defaultDataStoreId = "default";
const mapId = "mapId";
const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
const maxMessageSizeInBytes = 1 * 1024 * 1024; // 1MB
const generateRandomStringOfSize = (sizeInBytes: number): string =>
	crypto.randomBytes(sizeInBytes / 2).toString("hex");

function setMapKeys(map: SharedMap, count: number, item: string): void {
	for (let i = 0; i < count; i++) {
		map.set(`key${i}`, item);
	}
}

function validateMapKeys(map: SharedMap, count: number, expectedSize: number): void {
	for (let i = 0; i < count; i++) {
		const value = map.get(`key${i}`);
		assert(value !== undefined);
		assert(value.length === expectedSize);
	}
}

export class DocumentMap implements IDocumentLoaderAndSummarizer {
	private testContainerConfig: ITestContainerConfig | undefined;
	private loader: IHostLoader | undefined;
	private readonly keysInMap: number;
	private readonly sizeOfItemMb: number;
	private _mainContainer: IContainer | undefined;
	private dataObject1: ITestFluidObject | undefined;
	private dataObject1map: SharedMap | undefined;
	private fileName: string = "";
	private containerUrl: IResolvedUrl | undefined;
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

		switch (this.props.documentType) {
			case "DocumentMap":
				this.keysInMap = this.props.documentTypeInfo.numberOfItems;
				this.sizeOfItemMb = this.props.documentTypeInfo.itemSizeMb;
				break;
			default:
				throw new Error("Invalid document type");
		}
	}

	public async initializeDocument() {
		this.testContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry,
			runtimeOptions: {
				summaryOptions: {
					initialSummarizerDelayMs: 0,
					summaryConfigOverrides: {
						state: "disabled",
					},
				},
				compressionOptions: {
					minimumBatchSizeInBytes: 1024 * 1024,
					compressionAlgorithm: CompressionAlgorithms.lz4,
				},
				chunkSizeInBytes: 600 * 1024,
			},
			loaderProps: { logger: this.props.logger },
		};

		this.loader = this.props.provider.makeTestLoader(this.testContainerConfig);
		this._mainContainer = await this.loader.createDetachedContainer(
			this.props.provider.defaultCodeDetails,
		);

		this.dataObject1 = await requestFluidObject<ITestFluidObject>(
			this._mainContainer,
			"default",
		);
		this.dataObject1map = await this.dataObject1.getSharedObject<SharedMap>(mapId);
		const largeString = generateRandomStringOfSize(maxMessageSizeInBytes * this.sizeOfItemMb);

		setMapKeys(this.dataObject1map, this.keysInMap, largeString);
		this.fileName = uuid();

		await this._mainContainer.attach(
			this.props.provider.driver.createCreateNewRequest(this.fileName),
		);
		assert(this._mainContainer.resolvedUrl, "Container URL should be resolved");
		this.containerUrl = this._mainContainer.resolvedUrl;
		await waitForContainerConnection(this._mainContainer, true);
	}

	public async loadDocument(): Promise<IContainer> {
		assert(this.loader !== undefined, "loader should be initialized when loading a document");
		const requestUrl = await this.props.provider.driver.createContainerUrl(
			this.fileName,
			this.containerUrl,
		);
		const testRequest: IRequest = {
			headers: {
				[LoaderHeader.cache]: false,
			},
			url: requestUrl,
		};

		const container2 = await this.loader.resolve(testRequest);
		const dataObject2 = await requestFluidObject<ITestFluidObject>(
			container2,
			defaultDataStoreId,
		);
		const dataObject2map = await dataObject2.getSharedObject<SharedMap>(mapId);
		validateMapKeys(dataObject2map, this.keysInMap, maxMessageSizeInBytes * this.sizeOfItemMb);

		return container2;
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
			"mainContainer needs to be initialized before summarization",
		);
		const { container: containerClient, summarizer: summarizerClient } = await createSummarizer(
			this.props.provider,
			this._mainContainer,
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

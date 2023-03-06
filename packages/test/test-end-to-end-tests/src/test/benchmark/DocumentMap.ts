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
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { CompressionAlgorithms } from "@fluidframework/container-runtime";
import { IDocumentLoader, IDocumentProps } from "./DocumentCreator";

export enum DocumentSize {
	NotDefined = 0,
	Medium = 1,
	Large = 2,
}

const defaultDataStoreId = "default";
const mapId = "mapId";
const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
const maxMessageSizeInBytes = 5 * 1024 * 1024; // 5MB
const generateRandomStringOfSize = (sizeInBytes: number): string =>
	crypto.randomBytes(sizeInBytes / 2).toString("hex");

const setMapKeys = (map: SharedMap, count: number, item: string): void => {
	for (let i = 0; i < count; i++) {
		map.set(`key${i}`, item);
	}
};

const validateMapKeys = (map: SharedMap, count: number, expectedSize: number): void => {
	for (let i = 0; i < count; i++) {
		const key = map.get(`key${i}`);
		assert(key !== undefined);
		assert(key.length === expectedSize);
	}
};

export class DocumentMap implements IDocumentLoader {
	private testContainerConfig: ITestContainerConfig | undefined;
	private loader: IHostLoader | undefined;
	private readonly documentSize: DocumentSize = DocumentSize.NotDefined;
	private _mainContainer: IContainer | undefined;
	private dataObject1: ITestFluidObject | undefined;
	private dataObject1map: SharedMap | undefined;
	private _fileName: string = "";
	private _containerUrl: IResolvedUrl | undefined;
	public get logger() {
		return this.props.logger;
	}
	public get mainContainer() {
		return this._mainContainer;
	}
	public get fileName() {
		return this._fileName;
	}
	public set fileName(fileName: string) {
		this._fileName = fileName;
	}
	public get containerUrl() {
		return this._containerUrl;
	}
	public set containerUrl(containerUrl: IResolvedUrl | undefined) {
		this._containerUrl = containerUrl;
	}

	/**
	 * Creates a new DocumentCreator using configuration parameters.
	 * @param props - Properties for initializing the Document Creator.
	 * @param documentSize - Size of the document to be created 1=5Mb, 2=10Mb, etc.
	 */
	public constructor(private readonly props: IDocumentProps) {
		switch (this.props.documentType) {
			case "MediumDocumentMap":
				this.documentSize = DocumentSize.Medium;
				break;
			case "LargeDocumentMap":
				this.documentSize = DocumentSize.Large;
				break;
			default:
				throw new Error("Invalid document type");
		}
	}

	// add argument to identify the type of benchmarkType = "E2ETime" | "E2EThroughput"
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
		};
		this.testContainerConfig.loaderProps = { logger: this.props.logger };

		this.loader = this.props.provider.makeTestLoader(this.testContainerConfig);
		this._mainContainer = await this.loader.createDetachedContainer(
			this.props.provider.defaultCodeDetails,
		);

		this.dataObject1 = await requestFluidObject<ITestFluidObject>(
			this._mainContainer,
			"default",
		);
		this.dataObject1map = await this.dataObject1.getSharedObject<SharedMap>(mapId);
		const largeString = generateRandomStringOfSize(maxMessageSizeInBytes);

		setMapKeys(this.dataObject1map, this.documentSize, largeString);
		this.fileName = uuid();

		await this._mainContainer.attach(
			this.props.provider.driver.createCreateNewRequest(this.fileName),
		);
		assert(this._mainContainer.resolvedUrl, "Container URL should be resolved");
		this.containerUrl = this._mainContainer.resolvedUrl;
		await waitForContainerConnection(this._mainContainer, true);
	}

	public async loadDocument(): Promise<IContainer> {
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

		assert(this.loader !== undefined, "loader should be initialized when loading a document");
		const container2 = await this.loader.resolve(testRequest);
		const dataObject2 = await requestFluidObject<ITestFluidObject>(
			container2,
			defaultDataStoreId,
		);
		const dataObject2map = await dataObject2.getSharedObject<SharedMap>(mapId);
		dataObject2map.set("setup", "done");
		validateMapKeys(dataObject2map, this.documentSize, maxMessageSizeInBytes);

		return container2;
	}
}

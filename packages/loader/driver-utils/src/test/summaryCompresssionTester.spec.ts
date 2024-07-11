/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/dot-notation */

import { strict as assert } from "assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import {
	IClient,
	ISummaryBlob,
	ISummaryHandle,
	ISummaryTree,
	SummaryType,
} from "@fluidframework/driver-definitions";
import {
	FetchSource,
	IDocumentDeltaConnection,
	IDocumentDeltaStorageService,
	IDocumentService,
	IDocumentServiceEvents,
	IDocumentServiceFactory,
	IDocumentServicePolicies,
	IDocumentStorageService,
	IDocumentStorageServicePolicies,
	IResolvedUrl,
	ISummaryContext,
	ICreateBlobResponse,
	ISnapshotTree,
	IVersion,
} from "@fluidframework/driver-definitions/internal";

import {
	ICompressionStorageConfig,
	SummaryCompressionAlgorithm,
	applyStorageCompression,
	blobHeadersBlobName,
} from "../adapters/index.js";
import { DocumentStorageServiceProxy } from "../documentStorageServiceProxy.js";

import { snapshotTree, summaryTemplate } from "./summaryCompressionData.js";

/**
 * This function clones the imported summary and returns a new summary with the same content.
 */
function cloneSummary(): ISummaryTree {
	return JSON.parse(JSON.stringify(summaryTemplate)) as ISummaryTree;
}

/**
 * This function generates the summary with the given content size. At first it clones the summary
 * template, then it generates the content with the given size by loop, which will
 * use repeated sequence from 0 to 10 to generate the content until the content size is achieved.
 * The content is stored in the header of the summary.
 * @param contentSize - The size of the content to be generated.
 */
function generateSummaryWithContent(contentSize: number) {
	const summary = cloneSummary();
	const header = (
		(
			((summary.tree[".channels"] as ISummaryTree).tree.rootDOId as ISummaryTree).tree[
				".channels"
			] as ISummaryTree
		).tree["7a99532d-94ec-43ac-8a53-d9f978ad4ae9"] as ISummaryTree
	).tree.header;
	let contentString = "";
	while (contentString.length < contentSize) {
		if (contentString.length + 10 > contentSize) {
			contentString += "0123456789".substring(0, contentSize - contentString.length);
			break;
		} else {
			contentString += "0123456789";
		}
	}
	header["content"] = `{"value": ${contentString}}`;
	return summary;
}

function generateSummaryWithBinaryContent(startsWith: number, contentSize: number) {
	const summary = cloneSummary();
	const header = (
		(
			((summary.tree[".channels"] as ISummaryTree).tree.rootDOId as ISummaryTree).tree[
				".channels"
			] as ISummaryTree
		).tree["7a99532d-94ec-43ac-8a53-d9f978ad4ae9"] as ISummaryTree
	).tree.header;
	const content = new Uint8Array(contentSize);
	content[0] = startsWith;
	for (let i = 1; i < contentSize; i = i + 10) {
		for (let j = 0; j < 10; j++) {
			content[i + j] = j;
		}
	}
	header["content"] = content;
	return summary;
}

const misotestid: string = "misotest-id";

const abcContent = "ABC";
class InternalTestStorage implements IDocumentStorageService {
	constructor() {}
	private _uploadedSummary: ISummaryTree | undefined;

	policies?: IDocumentStorageServicePolicies | undefined;

	async getSnapshotTree(
		version?: IVersion | undefined,
		scenarioName?: string | undefined,
	): Promise<ISnapshotTree | null> {
		return JSON.parse(JSON.stringify(snapshotTree));
	}
	async getVersions(
		versionId: string | null,
		count: number,
		scenarioName?: string | undefined,
		fetchSource?: FetchSource | undefined,
	): Promise<IVersion[]> {
		throw new Error("Method not implemented.");
	}
	async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
		throw new Error("Method not implemented.");
	}
	async readBlob(id: string): Promise<ArrayBufferLike> {
		return id === misotestid
			? new TextEncoder().encode(abcContent)
			: getHeaderContent(this._uploadedSummary!);
	}
	async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		this._uploadedSummary = summary;
		return "test";
	}
	async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
		return this._uploadedSummary!;
	}
	disposed?: boolean | undefined;
	dispose?(error?: Error | undefined): void {
		throw new Error("Method not implemented.");
	}

	public get uploadedSummary(): ISummaryTree | undefined {
		return this._uploadedSummary;
	}

	public thisIsReallyOriginalStorage: string = "yes";
}

function isOriginalStorage(storage: IDocumentStorageService): boolean {
	return (storage as InternalTestStorage).thisIsReallyOriginalStorage === "yes";
}

class InternalTestDocumentService
	extends TypedEventEmitter<IDocumentServiceEvents>
	implements IDocumentService
{
	constructor() {
		super();
	}
	resolvedUrl: IResolvedUrl = {} as any;
	policies?: IDocumentServicePolicies | undefined;
	storage: IDocumentStorageService = new InternalTestStorage();
	async connectToStorage(): Promise<IDocumentStorageService> {
		return this.storage;
	}
	async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		throw new Error("Method not implemented.");
	}
	async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
		throw new Error("Method not implemented.");
	}
	dispose(error?: any): void {
		throw new Error("Method not implemented.");
	}
}

class InternalTestDocumentServiceFactory implements IDocumentServiceFactory {
	private readonly documentService: IDocumentService;
	constructor() {
		this.documentService = new InternalTestDocumentService();
	}

	async createDocumentService(
		resolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger | undefined,
		clientIsSummarizer?: boolean | undefined,
	): Promise<IDocumentService> {
		return this.documentService;
	}
	async createContainer(
		createNewSummary: ISummaryTree | undefined,
		createNewResolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger | undefined,
		clientIsSummarizer?: boolean | undefined,
	): Promise<IDocumentService> {
		return this.documentService;
	}
}

async function buildCompressionStorage(
	config?: ICompressionStorageConfig | boolean,
): Promise<IDocumentStorageService> {
	{
		const factory: IDocumentServiceFactory = applyStorageCompression(
			new InternalTestDocumentServiceFactory(),
			config,
		);
		const documentService = await factory.createContainer(undefined, {} as any);
		const storage = await documentService.connectToStorage();
		return storage;
	}
}

const prefixForUncompressed = 0xb0;
const prefixForLZ4 = 0xb1;
describe("Summary Compression Test", () => {
	it("Verify Proper Summary Generation", async () => {
		const summary = generateSummaryWithContent(1000000);
		const content = getHeaderContent(summary);
		assert(
			content.length === 1000000 + 11,
			`The content size is ${content.length} and should be 1000011`,
		);
	});
	it("Verify Config True", async () => {
		const storage = await buildCompressionStorage(true);
		checkCompressionConfig(storage, 500, SummaryCompressionAlgorithm.LZ4);
	});
	it("Verify Config False", async () => {
		const storage = await buildCompressionStorage(false);
		const config = (storage as any)._config;
		assert(config === undefined, "The storage has compression");
		assert(isOriginalStorage(storage), "The storage is not the original storage");
	});
	it("Verify Config Empty", async () => {
		const storage = await buildCompressionStorage();
		const config = (storage as any)._config;
		assert(config === undefined, "The storage has compression");
		assert(isOriginalStorage(storage), "The storage is not the original storage");
	});
	it("Verify Config Object (summary-blob markup)", async () => {
		const config: ICompressionStorageConfig = {
			algorithm: SummaryCompressionAlgorithm.None,
			minSizeToCompress: 763,
		};
		const storage = await buildCompressionStorage(config);
		checkCompressionConfig(storage, 763, SummaryCompressionAlgorithm.None);
	});

	it("Verify Compressed Markup at Summary (summary-blob markup)", async () => {
		const config: ICompressionStorageConfig = {
			algorithm: SummaryCompressionAlgorithm.LZ4,
			minSizeToCompress: 500,
		};
		const storage = (await buildCompressionStorage(config)) as DocumentStorageServiceProxy;
		const summary = generateSummaryWithContent(1000);
		await storage.uploadSummaryWithContext(summary, {
			referenceSequenceNumber: 0,
			proposalHandle: "test",
			ackHandle: "test",
		});
		const uploadedSummary = ((storage as any).service as InternalTestStorage).uploadedSummary;
		assert(
			uploadedSummary?.tree[blobHeadersBlobName] !== undefined,
			"The summary-blob markup is not added",
		);
	});

	it("Verify Blob Enc/Dec Symmetry (summary-blob markup)", async () => {
		const config: ICompressionStorageConfig = {
			algorithm: SummaryCompressionAlgorithm.LZ4,
			minSizeToCompress: 500,
		};
		await checkEncDec(config);
	});

	it("Verify Blob Enc/Dec no-compress Symmetry (summary-blob markup)", async () => {
		const config: ICompressionStorageConfig = {
			algorithm: SummaryCompressionAlgorithm.None,
			minSizeToCompress: 500,
		};
		await checkEncDec(config);
	});

	it("Verify Upload / Download Summary (summary-blob markup)", async () => {
		const config: ICompressionStorageConfig = {
			algorithm: SummaryCompressionAlgorithm.LZ4,
			minSizeToCompress: 500,
		};
		await checkUploadDownloadSummary(config);
	});

	it("Verify Upload / Download Summary no-compress (summary-blob markup)", async () => {
		const config: ICompressionStorageConfig = {
			algorithm: SummaryCompressionAlgorithm.None,
			minSizeToCompress: 500,
		};
		await checkUploadDownloadSummary(config);
	});

	it("Verify no-compress small (summary-blob markup)", async () => {
		const config: ICompressionStorageConfig = {
			algorithm: SummaryCompressionAlgorithm.LZ4,
			minSizeToCompress: 500,
		};
		const storage = (await buildCompressionStorage(config)) as DocumentStorageServiceProxy;
		const summary = generateSummaryWithContent(300);
		await storage.uploadSummaryWithContext(summary, {
			referenceSequenceNumber: 0,
			proposalHandle: "test",
			ackHandle: "test",
		});
		const originalContent = getHeaderContent(summary);
		const content = new TextDecoder().decode(await storage.readBlob("1234"));
		assert(
			content === originalContent,
			`The content is not equal to original content \n${content} \n ${originalContent}`,
		);
	});

	it("Verify no-compress prefix (summary-blob markup)", async () => {
		const config: ICompressionStorageConfig = {
			algorithm: SummaryCompressionAlgorithm.LZ4,
			minSizeToCompress: 500,
		};
		const firstOriginalByte = 0xb3;
		const contentSize = 30;
		const uploadedContent: ArrayBufferLike = await uploadSummaryWithBinaryContent(
			firstOriginalByte,
			contentSize,
			config,
		);
		const firstByte = uploadedContent[0];
		const secondByte = uploadedContent[1];
		assert(
			firstByte === prefixForUncompressed,
			`The first byte should be ${prefixForUncompressed} but is  ${firstByte}`,
		);
		assert(
			secondByte === firstOriginalByte,
			`The second byte should be ${firstOriginalByte} but is ${secondByte}`,
		);
	});

	it("Verify compress prefix (summary-blob markup)", async () => {
		const config: ICompressionStorageConfig = {
			algorithm: SummaryCompressionAlgorithm.LZ4,
			minSizeToCompress: 500,
		};
		const firstOriginalByte = 0xb3;
		const contentSize = 800;
		const uploadedContent: ArrayBufferLike = await uploadSummaryWithBinaryContent(
			firstOriginalByte,
			contentSize,
			config,
		);
		const firstByte = uploadedContent[0];
		assert(
			firstByte === prefixForLZ4,
			`The first byte should be ${prefixForLZ4} but is  ${firstByte}`,
		);
	});

	it("Verify no-compress no-prefix (summary-blob markup)", async () => {
		const config: ICompressionStorageConfig = {
			algorithm: SummaryCompressionAlgorithm.LZ4,
			minSizeToCompress: 500,
		};
		const contentSize = 30;
		await testNoPrefix(contentSize, config);
	});

	it("Verify none-algorithm no-prefix (summary-blob markup)", async () => {
		const config: ICompressionStorageConfig = {
			algorithm: SummaryCompressionAlgorithm.None,
			minSizeToCompress: 500,
		};
		const contentSize = 800;
		await testNoPrefix(contentSize, config);
	});

	it("Verify prefix compressed (summary-blob markup)", async () => {
		const config: ICompressionStorageConfig = {
			algorithm: SummaryCompressionAlgorithm.LZ4,
			minSizeToCompress: 500,
		};
		const contentSize = 800;
		await testPrefix(contentSize, config);
	});

	it("Verify prefix uncompressed small size (summary-blob markup)", async () => {
		const config: ICompressionStorageConfig = {
			algorithm: SummaryCompressionAlgorithm.LZ4,
			minSizeToCompress: 500,
		};
		const contentSize = 30;
		await testPrefix(contentSize, config, 0xb0, 0xc0, prefixForUncompressed);
	});

	it("Verify prefix uncompressed algorithm none (summary-blob markup)", async () => {
		const config: ICompressionStorageConfig = {
			algorithm: SummaryCompressionAlgorithm.None,
			minSizeToCompress: 500,
		};
		const contentSize = 800;
		await testPrefix(contentSize, config, 0xb0, 0xc0, prefixForUncompressed);
	});

	it("Verify enc / dec compressed loop (summary-blob markup)", async () => {
		const config: ICompressionStorageConfig = {
			algorithm: SummaryCompressionAlgorithm.LZ4,
			minSizeToCompress: 500,
		};
		const contentSize = 800;
		await testEncDecBinaryLoop(contentSize, config);
	});

	it("Verify enc / dec uncompressed loop - algorithm none (summary-blob markup)", async () => {
		const config: ICompressionStorageConfig = {
			algorithm: SummaryCompressionAlgorithm.None,
			minSizeToCompress: 500,
		};
		const contentSize = 800;
		await testEncDecBinaryLoop(contentSize, config);
	});

	it("Verify enc / dec uncompressed loop - small (summary-blob markup)", async () => {
		const config: ICompressionStorageConfig = {
			algorithm: SummaryCompressionAlgorithm.None,
			minSizeToCompress: 500,
		};
		const contentSize = 30;
		await testEncDecBinaryLoop(contentSize, config);
	});
});
async function testNoPrefix(contentSize: number, config: ICompressionStorageConfig) {
	for (let i = 0; i < 256; i++) {
		if (i >= 0xb0 && i <= 0xbf) {
			continue;
		}
		const firstOriginalByte = i;

		const uploadedContent: ArrayBufferLike = await uploadSummaryWithBinaryContent(
			firstOriginalByte,
			contentSize,
			config,
		);
		const firstByte = uploadedContent[0];
		assert(
			firstByte === firstOriginalByte,
			`The first byte should be ${firstOriginalByte} but is  ${firstByte}`,
		);
	}
}

async function testPrefix(
	contentSize: number,
	config: ICompressionStorageConfig,
	from: number = 0,
	to: number = 256,
	prefix: number = prefixForLZ4,
) {
	for (let i = from; i < to; i++) {
		const firstOriginalByte = i;
		const uploadedContent: ArrayBufferLike = await uploadSummaryWithBinaryContent(
			firstOriginalByte,
			contentSize,
			config,
		);
		const firstByte = uploadedContent[0];
		assert(firstByte === prefix, `The first byte should be ${prefix} but is  ${firstByte}`);
	}
}

async function uploadSummaryWithBinaryContent(
	firstOriginalByte: number,
	contentSize: number,
	config: ICompressionStorageConfig,
) {
	const storage = (await buildCompressionStorage(config)) as DocumentStorageServiceProxy;
	const summary = generateSummaryWithBinaryContent(firstOriginalByte, contentSize);
	await storage.uploadSummaryWithContext(summary, {
		referenceSequenceNumber: 0,
		proposalHandle: "test",
		ackHandle: "test",
	});
	const uploadedSummary = ((storage as any).service as InternalTestStorage).uploadedSummary;
	const uploadedContent: ArrayBufferLike = getHeaderContent(uploadedSummary!);
	return uploadedContent;
}

async function checkUploadDownloadSummary(
	config: ICompressionStorageConfig,
): Promise<ISummaryTree> {
	const storage = (await buildCompressionStorage(config)) as DocumentStorageServiceProxy;
	const summary = generateSummaryWithContent(1000);
	const originBlobContent = getHeaderContent(summary);
	await storage.uploadSummaryWithContext(summary, {
		referenceSequenceNumber: 0,
		proposalHandle: "test",
		ackHandle: "test",
	});
	await storage.getSnapshotTree({ id: "test", treeId: "test" }, "test");
	const summaryHandle: ISummaryHandle = {
		type: SummaryType.Handle,
		handleType: SummaryType.Tree,
		handle: "test",
	};
	const downloadedSummary: ISummaryTree = await storage.downloadSummary(summaryHandle);
	const downloadedBlobContentBin = getHeaderContent(downloadedSummary);
	// const blobStr = new TextDecoder().decode(blob);
	const downloadedBlobContent = new TextDecoder().decode(downloadedBlobContentBin);
	assert(
		originBlobContent === downloadedBlobContent,
		`The origin and the downloaded blob are not the same
		\norigin     : ${originBlobContent}
		\ndownloaded : ${downloadedBlobContent}`,
	);
	return downloadedSummary;
}

async function checkEncDec(config: ICompressionStorageConfig) {
	const summary = generateSummaryWithContent(1000);
	await checkEncDecConfigurable(summary, config);
}

async function checkEncDecBinary(
	config: ICompressionStorageConfig,
	startsWith: number,
	contentSize: number,
) {
	const summary = generateSummaryWithBinaryContent(startsWith, contentSize);
	await checkEncDecConfigurable(summary, config, startsWith);
}

async function testEncDecBinaryLoop(
	contentSize: number,
	config: ICompressionStorageConfig,
	from: number = 0,
	to: number = 256,
) {
	for (let i = from; i < to; i++) {
		const firstOriginalByte = i;
		await checkEncDecBinary(config, firstOriginalByte, contentSize);
	}
}

function compareTwoBlobs(blob1: ArrayBufferLike, blob2: ArrayBufferLike): boolean {
	const blob1View = new Uint8Array(blob1);
	const blob2View = new Uint8Array(blob2);
	if (blob1View.length !== blob2View.length) {
		return false;
	}
	for (let i = 0; i < blob1View.length; i++) {
		if (blob1View[i] !== blob2View[i]) {
			return false;
		}
	}
	return true;
}

async function checkEncDecConfigurable(
	summary: ISummaryTree,
	config: ICompressionStorageConfig,
	startsWith = -1,
) {
	const storage = (await buildCompressionStorage(config)) as DocumentStorageServiceProxy;
	const originHeaderHolder: ISummaryTree = getHeaderHolder(summary);
	const originBlob = (originHeaderHolder.tree.header as ISummaryBlob).content;
	await storage.uploadSummaryWithContext(summary, {
		referenceSequenceNumber: 0,
		proposalHandle: "test",
		ackHandle: "test",
	});
	await storage.getSnapshotTree({ id: "test", treeId: "test" }, "test");
	const blob: ArrayBufferLike = await storage.readBlob("abcd");
	if (typeof originBlob === "string") {
		const blobStr = new TextDecoder().decode(blob);
		assert(
			blobStr === originBlob,
			`The origin and the downloaded blob starting with ${startsWith} are not the same \n\n\n${blobStr}\n\n${originBlob}`,
		);
	} else {
		assert(
			compareTwoBlobs(blob, originBlob),
			`The origin and the downloaded blob are not the same \n\n\n${blob.byteLength}\n\n${originBlob.byteLength}.
			The first bytes are ${blob[0]} and ${originBlob[0]}`,
		);
	}
}

function checkCompressionConfig(
	storage: IDocumentStorageService,
	expectedMinSizeToCompress: number,
	expectedAlgorithm: SummaryCompressionAlgorithm,
) {
	const config = (storage as any)._config;
	assert(config !== undefined, "The storage has no compression");
	assert(
		(config.minSizeToCompress === expectedMinSizeToCompress,
		`Unexpected minSizeToCompress config ${config.minSizeToCompress}`),
	);
	assert(
		(config.algorithmm === expectedAlgorithm,
		`Unexpected minSizeToCompress config ${config.algorithmm}`),
	);
}

function getHeaderContent(summary: ISummaryTree) {
	return getHeader(summary)["content"];
}

function getHeader(summary: ISummaryTree) {
	return getHeaderHolder(summary).tree.header;
}

function getHeaderHolder(summary: ISummaryTree) {
	return (
		((summary.tree[".channels"] as ISummaryTree).tree.rootDOId as ISummaryTree).tree[
			".channels"
		] as ISummaryTree
	).tree["7a99532d-94ec-43ac-8a53-d9f978ad4ae9"] as ISummaryTree;
}

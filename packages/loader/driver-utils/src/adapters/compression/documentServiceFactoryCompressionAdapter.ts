/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import {
	IDocumentService,
	IDocumentServiceFactory,
	IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { ISummaryTree, SummaryObject, SummaryType } from "@fluidframework/protocol-definitions";
import { DocumentServiceFactoryProxy } from "../../documentServiceFactoryProxy";
import { ICompressionStorageConfig } from "./documentStorageServiceCompressionAdapter";
import { DocumentServiceCompressionAdapter } from "./documentServiceCompressionAdapter";

export class DocumentServiceFactoryCompressionAdapter extends DocumentServiceFactoryProxy {
	constructor(
		serviceFactory: IDocumentServiceFactory,
		private readonly _config: ICompressionStorageConfig,
	) {
		super(serviceFactory);
	}

	public async createContainer(
		createNewSummary: ISummaryTree | undefined,
		createNewResolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		const service = await this.serviceFactory.createContainer(
			createNewSummary,
			createNewResolvedUrl,
			logger,
			clientIsSummarizer,
		);
		return new DocumentServiceCompressionAdapter(service, this._config);
	}

	public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
		const service = await this.serviceFactory.createDocumentService(resolvedUrl);
		return new DocumentServiceCompressionAdapter(service, this._config);
	}

	/**
	 * This method traverses the given summary tree. It will collect names of all ITreeBlob entries.
	 * It will create new ITreeBlob inside the given summary tree beside the blob which has name ".metadata", which
	 * can be nested deeper in the tree.
	 * The new blob will have name ".metadata_compressed" and will contain the list of blob names collected in the first step.
	 * @param summary - summary tree to traverse
	 */
	public addCompressionMarkup(summary: ISummaryTree): void {
		const blobNames: string[] = [];
		const addBlobName = (path: string) => {
			blobNames.push(path);
		};
		let compressedBlobHolder;
		const traverse = (tree: SummaryObject, path: string) => {
			if (tree.type === SummaryType.Tree) {
				for (const [key, value] of Object.entries(tree.tree)) {
					if (value.type === SummaryType.Blob && key !== ".metadata") {
						compressedBlobHolder = tree;
					}
					if (value.type === SummaryType.Tree) {
						traverse(value, `${path}/${key}`);
					} else if (value.type === SummaryType.Blob) {
						addBlobName(`${path}/${key}`);
					}
				}
			}
		};
		traverse(summary, "");
		compressedBlobHolder.tree[".metadata_compressed"] = {
			type: SummaryType.Blob,
			content: JSON.stringify(blobNames),
		};
	}
}

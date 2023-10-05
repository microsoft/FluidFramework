/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A service to manage common checkpoint operations in scribe and deli
 */

import {
	BaseTelemetryProperties,
	getLumberBaseProperties,
	LumberEventName,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";
import { ICheckpointRepository, IDocumentRepository } from "./database";
import { IDeliState, IDocument, IScribe } from "./document";

type DocumentLambda = "deli" | "scribe";

export class CheckpointService implements ICheckpointService {
	constructor(
		private readonly checkpointRepository: ICheckpointRepository,
		private readonly documentRepository: IDocumentRepository,
		private readonly isLocalCheckpointEnabled: boolean,
	) {}
	localCheckpointEnabled: boolean = this.isLocalCheckpointEnabled;
	async writeCheckpoint(
		documentId: string,
		tenantId: string,
		service: DocumentLambda,
		checkpoint: IScribe | IDeliState,
		isLocal: boolean = false,
		markAsCorrupt: boolean = false,
	) {
		// services may not be able to process documents in corrupted state
		// so we write to local and global databases when marking document as corrupt
		if (markAsCorrupt) {
			await this.writeGlobalCheckpoint(
				documentId,
				tenantId,
				service,
				checkpoint,
				this.localCheckpointEnabled,
			).catch((error) => {
				Lumberjack.error(
					`Error marking document as corrupt in global collection.`,
					getLumberBaseProperties(documentId, tenantId),
					error,
				);
			});
			if (this.localCheckpointEnabled && this.checkpointRepository) {
				await this.writeLocalCheckpoint(documentId, tenantId, checkpoint);
			}
			return;
		}

		if (!this.localCheckpointEnabled || !this.checkpointRepository) {
			// Write to global collection when local checkpoints are disabled or there is no checkpoint repository
			await this.writeGlobalCheckpoint(
				documentId,
				tenantId,
				service,
				checkpoint,
				this.localCheckpointEnabled,
			);
			return;
		}

		await (isLocal
			? this.writeLocalCheckpoint(documentId, tenantId, checkpoint)
			: this.writeGlobalCheckpoint(
					documentId,
					tenantId,
					service,
					checkpoint,
					this.localCheckpointEnabled,
			  ));
	}

	private async writeLocalCheckpoint(
		documentId: string,
		tenantId: string,
		checkpoint: IScribe | IDeliState,
	) {
		const lumberProperties = getLumberBaseProperties(documentId, tenantId);
		try {
			await this.checkpointRepository.writeCheckpoint(documentId, tenantId, checkpoint);
		} catch (error) {
			Lumberjack.error(`Error writing checkpoint to local database`, lumberProperties, error);
			throw error;
		}
	}

	private async writeGlobalCheckpoint(
		documentId: string,
		tenantId: string,
		service: string,
		checkpoint: IScribe | IDeliState,
		localCheckpointEnabled: boolean,
	) {
		const lumberProperties = getLumberBaseProperties(documentId, tenantId);

		const checkpointFilter = {
			documentId,
			tenantId,
		};
		const checkpointData = {
			// stored as stringified JSON
			[service]: JSON.stringify(checkpoint),
		};

		try {
			await this.documentRepository.updateOne(checkpointFilter, checkpointData, null);
		} catch (error) {
			Lumberjack.error(
				`Error writing checkpoint to the global database.`,
				lumberProperties,
				error,
			);
			throw error;
		}

		if (localCheckpointEnabled) {
			try {
				await this.checkpointRepository.deleteCheckpoint(documentId, tenantId);
			} catch (error) {
				Lumberjack.error(
					`Error removing checkpoint data from the local database.`,
					lumberProperties,
					error,
				);
			}
		}
	}

	async clearCheckpoint(
		documentId: string,
		tenantId: string,
		service: DocumentLambda,
		isLocal: boolean = false,
	) {
		const lumberProperties = getLumberBaseProperties(documentId, tenantId);
		const checkpointFilter = {
			documentId,
			tenantId,
		};

		await (isLocal && this.localCheckpointEnabled
			? this.checkpointRepository
					.removeServiceCheckpoint(documentId, tenantId)
					.catch((error) => {
						Lumberjack.error(
							`Error removing checkpoint from local databse.`,
							lumberProperties,
							error,
						);
					})
			: this.documentRepository.updateOne(checkpointFilter, {
					[service]: "",
			  }));
	}

	async restoreFromCheckpoint(
		documentId: string,
		tenantId: string,
		service: DocumentLambda,
		document: IDocument,
	) {
		let checkpoint;
		let lastCheckpoint: IDeliState | IScribe;
		let isLocalCheckpoint = false;
		let localLogOffset;
		let globalLogOffset;
		let localSequenceNumber;
		let globalSequenceNumber;

		const restoreFromCheckpointMetric = Lumberjack.newLumberMetric(
			LumberEventName.RestoreFromCheckpoint,
		);
		let checkpointSource = "defaultGlobalCollection";

		try {
			if (!this.localCheckpointEnabled || !this.checkpointRepository) {
				// If we cannot checkpoint locally, use document
				lastCheckpoint = JSON.parse(document[service]);
				globalLogOffset = lastCheckpoint.logOffset;
				globalSequenceNumber = lastCheckpoint.sequenceNumber;
			} else {
				// Search checkpoints collection for checkpoint
				try {
					checkpoint = await this.checkpointRepository.getCheckpoint(
						documentId,
						tenantId,
					);
				} catch (error) {
					checkpoint = undefined;
					Lumberjack.error(
						`Error retrieving local checkpoint`,
						getLumberBaseProperties(documentId, tenantId),
					);
					checkpointSource = "notFoundInLocalCollection";
				}

				if (checkpoint?.[service]) {
					const localCheckpoint: IDeliState | IScribe = JSON.parse(checkpoint[service]);
					const globalCheckpoint: IDeliState | IScribe = JSON.parse(document[service]);

					// Compare local and global checkpoints to use latest version
					if (localCheckpoint.sequenceNumber < globalCheckpoint.sequenceNumber) {
						// if local checkpoint is behind global, use global
						lastCheckpoint = globalCheckpoint;
						checkpointSource = "latestFoundInGlobalCollection";
						isLocalCheckpoint = false;
					} else {
						lastCheckpoint = localCheckpoint;
						checkpointSource = "latestFoundInLocalCollection";
						isLocalCheckpoint = true;
					}
					localLogOffset = localCheckpoint.logOffset;
					globalLogOffset = globalCheckpoint.logOffset;
					localSequenceNumber = localCheckpoint.sequenceNumber;
					globalSequenceNumber = globalCheckpoint.sequenceNumber;
				} else {
					// If checkpoint does not exist, use document
					Lumberjack.info(
						`Local checkpoint not found.`,
						getLumberBaseProperties(documentId, tenantId),
					);
					checkpointSource = "notFoundInLocalCollection";
					lastCheckpoint = JSON.parse(document[service]);
					globalLogOffset = lastCheckpoint.logOffset;
					globalSequenceNumber = lastCheckpoint.sequenceNumber;
				}
			}
			restoreFromCheckpointMetric.setProperties({
				[BaseTelemetryProperties.tenantId]: tenantId,
				[BaseTelemetryProperties.documentId]: documentId,
				service,
				checkpointSource,
				retrievedFromLocalDatabase: isLocalCheckpoint,
				globalLogOffset,
				localLogOffset,
				globalSequenceNumber,
				localSequenceNumber,
			});
		} catch (error) {
			Lumberjack.error(
				`Error finding the last checkpoint.`,
				getLumberBaseProperties(documentId, tenantId),
				error,
			);
		}

		if (lastCheckpoint) {
			restoreFromCheckpointMetric.success(`Restored checkpoint from database.`);
			return lastCheckpoint;
		} else {
			restoreFromCheckpointMetric.error(
				`Error restoring checkpoint from database. Last checkpoint not found.`,
			);
			return;
		}
	}

	async getLatestCheckpoint(
		tenantId: string,
		documentId: string,
		activeClients?: boolean,
	): Promise<any> {
		if (this.isLocalCheckpointEnabled === false) {
			// Not using checkpointRepository, use document repository
			return this.documentRepository.readOne({ documentId, tenantId });
		}

		if (activeClients === false) {
			// Local checkpoints are enabled, but no active clients, use document repository
			return this.documentRepository.readOne({ documentId, tenantId });
		}

		const checkpoint = await this.checkpointRepository
			.getCheckpoint(documentId, tenantId)
			.catch((error) => {
				Lumberjack.error(
					`Error reading checkpoint from checkpoint collection.`,
					getLumberBaseProperties(documentId, tenantId),
					error,
				);
			});

		return checkpoint ? checkpoint : this.documentRepository.readOne({ documentId, tenantId });
	}
}

export interface ICheckpointService {
	localCheckpointEnabled: boolean;
	writeCheckpoint(
		documentId: string,
		tenantId: string,
		service: string,
		checkpoint: IScribe | IDeliState,
		isLocal: boolean,
		markAsCorrupt?: boolean,
	): Promise<void>;
	clearCheckpoint(
		documentId: string,
		tenantId: string,
		service: DocumentLambda,
		isLocal: boolean,
	): Promise<void>;
	restoreFromCheckpoint(
		documentId: string,
		tenantId: string,
		service: DocumentLambda,
		document: IDocument,
	): Promise<IScribe | IDeliState>;
	getLatestCheckpoint(
		tenantId: string,
		documentId: string,
		localCheckpointEnabled?: boolean,
		activeClients?: boolean,
	): Promise<any>;
}

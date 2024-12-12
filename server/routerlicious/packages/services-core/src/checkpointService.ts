/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A service to manage common checkpoint operations in scribe and deli
 */

import {
	BaseTelemetryProperties,
	CommonProperties,
	getLumberBaseProperties,
	LumberEventName,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";
import { ICheckpointRepository, IDocumentRepository } from "./database";
import { IDeliState, IDocument, IScribe, type ICheckpoint } from "./document";

type DocumentLambda = "deli" | "scribe";

/**
 * @internal
 */
export class CheckpointService implements ICheckpointService {
	constructor(
		private readonly checkpointRepository: ICheckpointRepository,
		private readonly documentRepository: IDocumentRepository,
		private readonly isLocalCheckpointEnabled: boolean,
	) {}
	private readonly localCheckpointEnabled: boolean = this.isLocalCheckpointEnabled;
	private globalCheckpointFailed: boolean = false;
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
					true /* writeToLocalOnFailure */,
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
		writeToLocalOnFailure: boolean = false,
	) {
		const lumberProperties = getLumberBaseProperties(documentId, tenantId);
		let deleteLocalCheckpoint = true;

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
			this.globalCheckpointFailed = false;
		} catch (error) {
			Lumberjack.error(
				`Error writing checkpoint to the global database.`,
				lumberProperties,
				error,
			);
			this.globalCheckpointFailed = true;
			// Only delete local checkpoint if we can successfully write a global checkpoint
			deleteLocalCheckpoint = false;
			if (writeToLocalOnFailure && localCheckpointEnabled) {
				const globalCheckpointErrorMetric = Lumberjack.newLumberMetric(
					LumberEventName.GlobalCheckpointError,
				);

				try {
					Lumberjack.info(
						`Error writing checkpoint to global database. Writing to local database.`,
						lumberProperties,
					);
					globalCheckpointErrorMetric.setProperties({
						[BaseTelemetryProperties.tenantId]: tenantId,
						[BaseTelemetryProperties.documentId]: documentId,
						service,
					});
					await this.writeLocalCheckpoint(documentId, tenantId, checkpoint);
					globalCheckpointErrorMetric.success(
						`Local checkpoint successful after global checkpoint failure.`,
					);
				} catch (err) {
					globalCheckpointErrorMetric.error(
						`Local checkpoint failed after global checkpoint failure.`,
						err,
					);
					throw err;
				}
			}
		}

		if (localCheckpointEnabled && deleteLocalCheckpoint) {
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

	public async clearCheckpoint(
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

	public async restoreFromCheckpoint(
		documentId: string,
		tenantId: string,
		service: DocumentLambda,
		document: IDocument,
	): Promise<IScribe | IDeliState> {
		let lastCheckpoint: IDeliState | IScribe | undefined;
		let isLocalCheckpoint = false;
		let localLogOffset: number | undefined;
		let globalLogOffset: number | undefined;
		let localSequenceNumber: number | undefined;
		let globalSequenceNumber: number | undefined;
		let checkpointSource = "notFound";

		const restoreFromCheckpointMetric = Lumberjack.newLumberMetric(
			LumberEventName.RestoreFromCheckpoint,
		);
		const parseCheckpointString = (
			checkpointString: string | undefined,
		): IDeliState | IScribe | undefined =>
			checkpointString ? (JSON.parse(checkpointString) as IDeliState | IScribe) : undefined;

		try {
			if (!this.localCheckpointEnabled || !this.checkpointRepository) {
				// If we cannot checkpoint locally, use document
				lastCheckpoint = parseCheckpointString(document[service]);
				globalLogOffset = lastCheckpoint?.logOffset;
				globalSequenceNumber = lastCheckpoint?.sequenceNumber;
				checkpointSource = "defaultGlobalCollection";
			} else {
				// Search checkpoints collection for checkpoint
				const checkpoint: ICheckpoint | undefined =
					(await this.checkpointRepository
						.getCheckpoint(documentId, tenantId)
						.catch((error) => {
							Lumberjack.error(
								`Error retrieving local checkpoint`,
								getLumberBaseProperties(documentId, tenantId),
							);
							return undefined;
						})) ?? undefined;

				const localCheckpoint: IDeliState | IScribe | undefined = parseCheckpointString(
					checkpoint?.[service],
				);
				const globalCheckpoint: IDeliState | IScribe | undefined = parseCheckpointString(
					document[service],
				);
				localLogOffset = localCheckpoint?.logOffset;
				globalLogOffset = globalCheckpoint?.logOffset;
				localSequenceNumber = localCheckpoint?.sequenceNumber;
				globalSequenceNumber = globalCheckpoint?.sequenceNumber;

				if (localCheckpoint && !globalCheckpoint) {
					// If checkpoint does not exist in document (global), use local
					Lumberjack.info(
						`Global checkpoint not found.`,
						getLumberBaseProperties(documentId, tenantId),
					);
					lastCheckpoint = localCheckpoint;
					checkpointSource = "notFoundInGlobalCollection";
					isLocalCheckpoint = true;
				} else if (!localCheckpoint && globalCheckpoint) {
					// If checkpoint does not exist in local, use document (global)
					Lumberjack.info(
						`Local checkpoint not found.`,
						getLumberBaseProperties(documentId, tenantId),
					);
					checkpointSource = "notFoundInLocalCollection";
					lastCheckpoint = globalCheckpoint;
					isLocalCheckpoint = false;
				} else if (localCheckpoint && globalCheckpoint) {
					// If both checkpoints exist,
					// compare local and global checkpoints to use latest version
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
				}
			}
			restoreFromCheckpointMetric.setProperties({
				...getLumberBaseProperties(documentId, tenantId),
				[CommonProperties.isEphemeralContainer]: document.isEphemeralContainer,
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
			throw new Error("Could not restore checkpoint: Last checkpoint not found.");
		}
	}

	public async getLatestCheckpoint(
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

	public getLocalCheckpointEnabled() {
		return this.localCheckpointEnabled;
	}

	public getGlobalCheckpointFailed() {
		return this.globalCheckpointFailed;
	}
}

/**
 * @internal
 */
export interface ICheckpointService {
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
	getGlobalCheckpointFailed(): boolean;
	getLocalCheckpointEnabled(): boolean;
}

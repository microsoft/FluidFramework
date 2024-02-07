/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import { ICollection, ICheckpointRepository } from "./database";
import { ICheckpoint, IDeliState, IScribe } from "./document";

/**
 * @internal
 */
export class MongoCheckpointRepository implements ICheckpointRepository {
	constructor(
		private readonly collection: ICollection<ICheckpoint>,
		private readonly checkpointType: string,
	) {}

	async getCheckpoint(documentId: string, tenantId: string): Promise<ICheckpoint> {
		const pointReadFilter = this.composePointReadFilter(documentId, tenantId);
		return this.collection.findOne(pointReadFilter);
	}

	async writeCheckpoint(
		documentId: string,
		tenantId: string,
		checkpoint: IDeliState | IScribe,
	): Promise<void> {
		if (!this.checkpointType) {
			Lumberjack.error(
				"Cannot write checkpoint. Checkpoint type is not specified.",
				getLumberBaseProperties(documentId, tenantId),
			);
			return;
		}
		const pointReadFilter = this.composePointReadFilter(documentId, tenantId);
		try {
			await this.collection.upsert(
				pointReadFilter,
				{ [this.checkpointType]: JSON.stringify(checkpoint) },
				null,
			);
		} catch (error: any) {
			const err = new Error(`Checkpoint upsert error:  ${error.message?.substring(0, 30)}`);
			Lumberjack.error(
				"Unexpected error when writing checkpoint",
				{
					...getLumberBaseProperties(documentId, tenantId),
					pointReadFilter,
					checkpointType: this.checkpointType,
				},
				err,
			);
			throw error;
		}
	}

	async removeServiceCheckpoint(documentId, tenantId): Promise<void> {
		if (!this.checkpointType) {
			Lumberjack.error(
				"Cannot remove checkpoint. Checkpoint type is not specified.",
				getLumberBaseProperties(documentId, tenantId),
			);
			return;
		}
		const pointReadFilter = this.composePointReadFilter(documentId, tenantId);
		await this.collection.upsert(pointReadFilter, { [this.checkpointType]: "" }, null);
	}

	async deleteCheckpoint(documentId: string, tenantId: string): Promise<void> {
		const pointReadFilter = this.composePointReadFilter(documentId, tenantId);
		await this.collection.deleteOne(pointReadFilter);
	}

	private composePointReadFilter(
		documentId: string,
		tenantId: string,
	): { _id: string; documentId: string } & any {
		const isError = !documentId || !tenantId;

		if (isError) {
			const error = new Error(`Cannot create filter due to missing parameter`);
			Lumberjack.error(
				"Missing parameter when writing checkpoint.",
				{
					...getLumberBaseProperties(documentId, tenantId),
				},
				error,
			);
		}

		return { _id: documentId + tenantId, documentId };
	}
}

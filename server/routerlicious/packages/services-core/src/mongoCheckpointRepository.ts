/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import { ICollection, ICheckpointRepository } from "./database";
import { ICheckpoint, IDeliState, IScribe } from "./document";
import { runWithRetry } from "./runWithRetry";

/**
 * @internal
 */
export class MongoCheckpointRepository implements ICheckpointRepository {
	constructor(
		private readonly collection: ICollection<ICheckpoint>,
		private readonly checkpointType: string,
	) {}

	// eslint-disable-next-line @rushstack/no-new-null
	async getCheckpoint(documentId: string, tenantId: string): Promise<ICheckpoint | null> {
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
		const lumberProperties = {
			...getLumberBaseProperties(documentId, tenantId),
			pointReadFilter,
			checkpointType: this.checkpointType,
		};
		try {
			// Duplicate key errors have occurred when 2 upsert() occur at the same time for the same document
			// retry to allow both checkpoints
			await runWithRetry(
				async () =>
					this.collection.upsert(
						pointReadFilter,
						{ [this.checkpointType]: JSON.stringify(checkpoint) },
						null,
					),
				"checkpointRepository_writeCheckpoint",
				3 /* maxRetries */,
				1000 /* retryAfterMs */,
				lumberProperties,
				undefined /* ignoreError */,
				(error) => {
					// should retry if duplicate key error
					return (
						error.code === 11000 ||
						error.message?.toString()?.indexOf("E11000 duplicate key") >= 0
					);
				},
			);
		} catch (error: any) {
			const err = new Error(`Checkpoint upsert error:  ${error.message?.substring(0, 30)}`);
			Lumberjack.error("Unexpected error when writing checkpoint", lumberProperties, err);
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

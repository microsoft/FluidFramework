/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection, ICheckpointRepository } from "./database";
import { ICheckpoint, IDeliState, IScribe } from "./document";

export class MongoCheckpointRepository implements ICheckpointRepository {
	constructor(private readonly collection: ICollection<ICheckpoint>, private readonly checkpointType: string) {
    }

    async getCheckpoint(documentId: string, tenantId: string): Promise<ICheckpoint> {
        const pointReadFilter = this.composePointReadFilter({documentId, tenantId});
        return this.collection.findOne(pointReadFilter);
    }

    async writeCheckpoint(documentId: string, tenantId: string, checkpoint: IDeliState|IScribe): Promise<void> {
        const pointReadFilter = this.composePointReadFilter({documentId, tenantId});
        await this.collection.upsert(pointReadFilter, {[this.checkpointType]: JSON.stringify(checkpoint)}, null)
    }

    async removeServiceCheckpoint(documentId, tenantId): Promise<void> {
        const pointReadFilter = this.composePointReadFilter({documentId, tenantId});
        await this.collection.upsert(pointReadFilter, {[this.checkpointType]: "" }, null);
    }

    async deleteCheckpoint(documentId: string, tenantId: string): Promise<void> {
        const pointReadFilter = this.composePointReadFilter({documentId, tenantId});
        await this.collection.deleteOne(pointReadFilter);
    }

	private composePointReadFilter(filter: any): { _id: string; documentId: string } & any {
		const documentId = filter.documentId;
		return { ...filter, _id: documentId };
	}
}

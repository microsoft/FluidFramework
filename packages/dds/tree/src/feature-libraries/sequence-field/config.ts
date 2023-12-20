/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export enum CellOrderingMethod {
	Tombstone = "Tombstone",
	Lineage = "Lineage",
}

export interface SequenceConfig {
	readonly cellOrdering: CellOrderingMethod;
}

export const sequenceConfig: SequenceConfig = {
	cellOrdering: CellOrderingMethod.Tombstone,
};

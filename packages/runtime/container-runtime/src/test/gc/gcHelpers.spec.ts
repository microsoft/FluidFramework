/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
	IGarbageCollectionSnapshotData,
	IGarbageCollectionSummaryDetailsLegacy,
} from "@fluidframework/runtime-definitions";
import {
	getSnapshotDataFromOldSnapshotFormat,
	shouldAllowGcTombstoneEnforcement,
	GCFeatureMatrix,
	shouldAllowGcSweep,
} from "../../gc";
import { IContainerRuntimeMetadata, ReadFluidDataStoreAttributes } from "../../summary";

describe("Garbage Collection Helpers Tests", () => {
	describe("shouldAllowGcTombstoneEnforcement", () => {
		const testCases: {
			persisted: number | undefined;
			current: number | undefined;
			expectedShouldAllowValue: boolean;
		}[] = [
			{
				persisted: undefined,
				current: undefined,
				expectedShouldAllowValue: true,
			},
			{
				persisted: undefined,
				current: 1,
				expectedShouldAllowValue: false,
			},
			{
				persisted: 1,
				current: undefined,
				expectedShouldAllowValue: true,
			},
			{
				persisted: 1,
				current: 1,
				expectedShouldAllowValue: true,
			},
			{
				persisted: 1,
				current: 2,
				expectedShouldAllowValue: false,
			},
			{
				persisted: 2,
				current: 1,
				expectedShouldAllowValue: false,
			},
		];
		testCases.forEach(({ persisted, current, expectedShouldAllowValue }) => {
			it(`persisted=${persisted}, current=${current}`, () => {
				const shouldAllow = shouldAllowGcTombstoneEnforcement(persisted, current);
				assert.equal(shouldAllow, expectedShouldAllowValue);
			});
		});
	});

	describe("shouldAllowGcSweep", () => {
		const testCases: {
			persisted: GCFeatureMatrix;
			current: number | undefined;
			expectedShouldAllowValue: boolean;
		}[] = [
			{
				persisted: {},
				current: undefined,
				expectedShouldAllowValue: false,
			},
			{
				persisted: { sweepGeneration: 1 },
				current: undefined,
				expectedShouldAllowValue: false,
			},
			{
				persisted: {},
				current: 0,
				expectedShouldAllowValue: false,
			},
			{
				persisted: { tombstoneGeneration: 0 },
				current: 0,
				expectedShouldAllowValue: true,
			},
			{
				persisted: { tombstoneGeneration: 1 },
				current: 0,
				expectedShouldAllowValue: false,
			},
			{
				persisted: { sweepGeneration: 0 },
				current: 0,
				expectedShouldAllowValue: true,
			},
			{
				persisted: { sweepGeneration: 1 },
				current: 1,
				expectedShouldAllowValue: true,
			},
			{
				persisted: { sweepGeneration: 1 },
				current: 2,
				expectedShouldAllowValue: false,
			},
			{
				persisted: { sweepGeneration: 2 },
				current: 1,
				expectedShouldAllowValue: false,
			},
		];
		testCases.forEach(({ persisted, current, expectedShouldAllowValue }) => {
			it(`persisted=${JSON.stringify(persisted)}, current=${current}`, () => {
				const shouldAllow = shouldAllowGcSweep(persisted, current);
				assert.equal(shouldAllow, expectedShouldAllowValue);
			});
		});
	});

	describe("getSnapshotDataFromOldSnapshotFormat", () => {
		it("can convert GC data from old snapshot format to new format", async () => {
			const dsNodeId = "/ds";
			const ddsNodeId = "/ds/dds";
			const unreferencedTimestampMs = 500;
			const gcDetailsLegacy: IGarbageCollectionSummaryDetailsLegacy = {
				gcData: { gcNodes: { "/": [ddsNodeId] } },
				unrefTimestamp: unreferencedTimestampMs,
			};
			const gcBlobId = "dsGCBlob";
			const attributes: ReadFluidDataStoreAttributes = {
				isRootDataStore: true,
				pkg: "legacyDataStore",
			};
			const attributesBlobId = "dsAttributesBlob";
			const oldSnapshot: ISnapshotTree = {
				blobs: {},
				trees: {
					".channels": {
						trees: {
							[`${dsNodeId.slice(1)}`]: {
								blobs: {
									"gc": gcBlobId,
									".component": attributesBlobId,
								},
								trees: {},
							},
						},
						blobs: {},
					},
				},
			};
			const blobsMap = new Map();
			blobsMap.set(gcBlobId, gcDetailsLegacy);
			blobsMap.set(attributesBlobId, attributes);
			const metadata: Partial<IContainerRuntimeMetadata> = {};
			const snapshotData = await getSnapshotDataFromOldSnapshotFormat(
				oldSnapshot,
				metadata as IContainerRuntimeMetadata,
				async <T>(id: string) => blobsMap.get(id) as T,
			);

			const expectedSnapshotData: IGarbageCollectionSnapshotData = {
				gcState: {
					gcNodes: {
						"/": {
							outboundRoutes: [dsNodeId],
						},
						[`${dsNodeId}`]: {
							outboundRoutes: [ddsNodeId],
							unreferencedTimestampMs,
						},
					},
				},
				tombstones: undefined,
				deletedNodes: undefined,
			};
			assert.deepStrictEqual(
				snapshotData,
				expectedSnapshotData,
				"Old snapshot was not correctly converted",
			);
		});
	});
});

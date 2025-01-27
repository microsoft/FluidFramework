/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import {
	MessageType,
	type ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import type {
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import type { IFluidSerializer } from "@fluidframework/shared-object-base/internal";
import { SharedObject } from "@fluidframework/shared-object-base/internal";

import type { ISharedMap, ISharedMapEvents } from "./interfaces.js";
import {
	type IMapDataObjectSerializable,
	type IMapOperation,
	MapKernel,
} from "./mapKernel.js";

interface IMapSerializationFormat {
	blobs?: string[];
	content: IMapDataObjectSerializable;
}

const snapshotFileName = "header";

/**
 * {@inheritDoc ISharedMap}
 */
export class SharedMap extends SharedObject<ISharedMapEvents> implements ISharedMap {
	/**
	 * String representation for the class.
	 */
	public readonly [Symbol.toStringTag]: string = "SharedMap";

	/**
	 * MapKernel which manages actual map operations.
	 */
	private readonly kernel: MapKernel;

	/**
	 * Do not call the constructor. Instead, you should use the {@link SharedMap.create | create method}.
	 *
	 * @param id - String identifier.
	 * @param runtime - Data store runtime.
	 * @param attributes - The attributes for the map.
	 */
	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, "fluid_map_");
		this.kernel = new MapKernel(
			this.serializer,
			this.handle,
			(op, localOpMetadata) => this.submitLocalMessage(op, localOpMetadata),
			() => this.isAttached(),
			this,
		);
	}

	/**
	 * Get an iterator over the keys in this map.
	 * @returns The iterator
	 */
	public keys(): IterableIterator<string> {
		return this.kernel.keys();
	}

	/**
	 * Get an iterator over the entries in this map.
	 * @returns The iterator
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public entries(): IterableIterator<[string, any]> {
		return this.kernel.entries();
	}

	/**
	 * Get an iterator over the values in this map.
	 * @returns The iterator
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public values(): IterableIterator<any> {
		return this.kernel.values();
	}

	/**
	 * Get an iterator over the entries in this map.
	 * @returns The iterator
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public [Symbol.iterator](): IterableIterator<[string, any]> {
		return this.kernel.entries();
	}

	/**
	 * The number of key/value pairs stored in the map.
	 */
	public get size(): number {
		return this.kernel.size;
	}

	/**
	 * Executes the given callback on each entry in the map.
	 * @param callbackFn - Callback function
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public forEach(callbackFn: (value: any, key: string, map: Map<string, any>) => void): void {
		// eslint-disable-next-line unicorn/no-array-for-each, unicorn/no-array-callback-reference
		this.kernel.forEach(callbackFn);
	}

	/**
	 * {@inheritDoc ISharedMap.get}
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public get<T = any>(key: string): T | undefined {
		return this.kernel.get<T>(key);
	}

	/**
	 * Check if a key exists in the map.
	 * @param key - The key to check
	 * @returns True if the key exists, false otherwise
	 */
	public has(key: string): boolean {
		return this.kernel.has(key);
	}

	/**
	 * {@inheritDoc ISharedMap.set}
	 */
	public set(key: string, value: unknown): this {
		this.kernel.set(key, value);
		return this;
	}

	/**
	 * Delete a key from the map.
	 * @param key - Key to delete
	 * @returns True if the key existed and was deleted, false if it did not exist
	 */
	public delete(key: string): boolean {
		return this.kernel.delete(key);
	}

	/**
	 * Clear all data from the map.
	 */
	public clear(): void {
		this.kernel.clear();
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.summarizeCore}
	 */
	protected summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		let currentSize = 0;
		let counter = 0;
		let headerBlob: IMapDataObjectSerializable = {};
		const blobs: string[] = [];

		const builder = new SummaryTreeBuilder();

		const data = this.kernel.getSerializedStorage(serializer);

		// If single property exceeds this size, it goes into its own blob
		const MinValueSizeSeparateSnapshotBlob = 8 * 1024;

		// Maximum blob size for multiple map properties
		// Should be bigger than MinValueSizeSeparateSnapshotBlob
		const MaxSnapshotBlobSize = 16 * 1024;

		// Partitioning algorithm:
		// 1) Split large (over MinValueSizeSeparateSnapshotBlob = 8K) properties into their own blobs.
		//    Naming (across snapshots) of such blob does not have to be stable across snapshots,
		//    As de-duping process (in driver) should not care about paths, only content.
		// 2) Split remaining properties into blobs of MaxSnapshotBlobSize (16K) size.
		//    This process does not produce stable partitioning. This means
		//    modification (including addition / deletion) of property can shift properties across blobs
		//    and result in non-incremental snapshot.
		//    This can be improved in the future, without being format breaking change, as loading sequence
		//    loads all blobs at once and partitioning schema has no impact on that process.
		for (const key of Object.keys(data)) {
			const value = data[key];
			if (value.value && value.value.length >= MinValueSizeSeparateSnapshotBlob) {
				const blobName = `blob${counter}`;
				counter++;
				blobs.push(blobName);
				const content: IMapDataObjectSerializable = {
					[key]: {
						type: value.type,
						value: JSON.parse(value.value) as unknown,
					},
				};
				builder.addBlob(blobName, JSON.stringify(content));
			} else {
				currentSize += value.type.length + 21; // Approximation cost of property header
				if (value.value) {
					currentSize += value.value.length;
				}

				if (currentSize > MaxSnapshotBlobSize) {
					const blobName = `blob${counter}`;
					counter++;
					blobs.push(blobName);
					builder.addBlob(blobName, JSON.stringify(headerBlob));
					headerBlob = {};
					currentSize = 0;
				}
				headerBlob[key] = {
					type: value.type,
					value: value.value === undefined ? undefined : (JSON.parse(value.value) as unknown),
				};
			}
		}

		const header: IMapSerializationFormat = {
			blobs,
			content: headerBlob,
		};
		builder.addBlob(snapshotFileName, JSON.stringify(header));

		return builder.getSummaryTree();
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const json = await readAndParse<object>(storage, snapshotFileName);
		const newFormat = json as IMapSerializationFormat;
		if (Array.isArray(newFormat.blobs)) {
			this.kernel.populateFromSerializable(newFormat.content);
			await Promise.all(
				newFormat.blobs.map(async (value) => {
					const content = await readAndParse<IMapDataObjectSerializable>(storage, value);
					this.kernel.populateFromSerializable(content);
				}),
			);
		} else {
			this.kernel.populateFromSerializable(json as IMapDataObjectSerializable);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.onDisconnect}
	 */
	protected onDisconnect(): void {}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.reSubmitCore}
	 */
	protected reSubmitCore(content: unknown, localOpMetadata: unknown): void {
		this.kernel.trySubmitMessage(content as IMapOperation, localOpMetadata);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObjectCore.applyStashedOp}
	 */
	protected applyStashedOp(content: unknown): void {
		this.kernel.tryApplyStashedOp(content as IMapOperation);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.processCore}
	 */
	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
		if (message.type === MessageType.Operation) {
			assert(
				this.kernel.tryProcessMessage(
					message.contents as IMapOperation,
					local,
					localOpMetadata,
				),
				"Map received an unrecognized op, possibly from a newer version",
			);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.rollback}
	 */
	protected rollback(content: unknown, localOpMetadata: unknown): void {
		this.kernel.rollback(content, localOpMetadata);
	}
}

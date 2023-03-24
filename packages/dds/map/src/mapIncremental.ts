/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ISequencedDocumentMessage,
	MessageType,
	SummaryType,
} from "@fluidframework/protocol-definitions";
import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelStorageService,
	IChannelServices,
	IChannelFactory,
} from "@fluidframework/datastore-definitions";
import {
	IIncrementalContext,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import { IFluidSerializer, SharedObject } from "@fluidframework/shared-object-base";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { ISharedMap, ISharedMapEvents } from "./interfaces";
import { IMapDataObjectSerializable, IMapOperation, MapKernel } from "./mapKernel";
import { pkgVersion } from "./packageVersion";

interface IMapSerializationFormat {
	blobs?: string[];
	content: IMapDataObjectSerializable;
}

const snapshotFileName = "header";

function addBlobOrHandle(
	parentPath: string,
	blobName: string,
	previousBlob: string,
	currentBlob: string,
	builder: SummaryTreeBuilder,
) {
	if (currentBlob === previousBlob) {
		builder.addHandle(blobName, SummaryType.Blob, `${parentPath}/${blobName}`);
	} else {
		builder.addBlob(blobName, currentBlob);
	}
}

/**
 * {@link @fluidframework/datastore-definitions#IChannelFactory} for {@link SharedMapIncremental}.
 *
 * @sealed
 */
export class MapIncrementalFactory implements IChannelFactory {
	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public static readonly Type = "https://graph.microsoft.com/types/map-incremental";

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public static readonly Attributes: IChannelAttributes = {
		type: MapIncrementalFactory.Type,
		snapshotFormatVersion: "0.2",
		packageVersion: pkgVersion,
	};

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public get type(): string {
		return MapIncrementalFactory.Type;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public get attributes(): IChannelAttributes {
		return MapIncrementalFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<ISharedMap> {
		const map = new SharedMapIncremental(id, runtime, attributes);
		await map.load(services);

		return map;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string): ISharedMap {
		const map = new SharedMapIncremental(id, runtime, MapIncrementalFactory.Attributes);
		map.initializeLocal();

		return map;
	}
}

// If single property exceeds this size, it goes into its own blob
const MinValueSizeSeparateSnapshotBlob = 140;

// Maximum blob size for multiple map properties
// Should be bigger than MinValueSizeSeparateSnapshotBlob
const MaxSnapshotBlobSize = 280;

/**
 * {@inheritDoc ISharedMap}
 */
export class SharedMapIncremental extends SharedObject<ISharedMapEvents> implements ISharedMap {
	/**
	 * Create a new shared map.
	 * @param runtime - The data store runtime that the new shared map belongs to.
	 * @param id - Optional name of the shared map.
	 * @returns Newly created shared map.
	 *
	 * @example
	 * To create a `SharedMapIncremental`, call the static create method:
	 *
	 * ```typescript
	 * const myMap = SharedMapIncremental.create(this.runtime, id);
	 * ```
	 */
	public static create(runtime: IFluidDataStoreRuntime, id?: string): SharedMapIncremental {
		return runtime.createChannel(id, MapIncrementalFactory.Type) as SharedMapIncremental;
	}

	/**
	 * Get a factory for SharedMapIncremental to register with the data store.
	 * @returns A factory that creates SharedMapIncrementals and loads them from storage.
	 */
	public static getFactory(): IChannelFactory {
		return new MapIncrementalFactory();
	}

	/**
	 * String representation for the class.
	 */
	public readonly [Symbol.toStringTag]: string = "SharedMapIncremental";

	/**
	 * MapKernel which manages actual map operations.
	 */
	private readonly kernel: MapKernel;
	private readonly lastSummaryContent: Map<string, string> = new Map();

	/**
	 * Do not call the constructor. Instead, you should use the {@link SharedMapIncremental.create | create method}.
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

	public entries(): IterableIterator<[string, any]> {
		return this.kernel.entries();
	}

	/**
	 * Get an iterator over the values in this map.
	 * @returns The iterator
	 */
	// TODO: Use `unknown` instead (breaking change).

	public values(): IterableIterator<any> {
		return this.kernel.values();
	}

	/**
	 * Get an iterator over the entries in this map.
	 * @returns The iterator
	 */
	// TODO: Use `unknown` instead (breaking change).

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

	public forEach(callbackFn: (value: any, key: string, map: Map<string, any>) => void): void {
		this.kernel.forEach(callbackFn);
	}

	/**
	 * {@inheritDoc ISharedMap.get}
	 */
	// TODO: Use `unknown` instead (breaking change).

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
	 * @internal
	 */
	protected summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
		incrementalContext?: IIncrementalContext,
	): ISummaryTreeWithStats {
		let currentSize = 0;
		let counter = 0;
		let headerBlob: IMapDataObjectSerializable = {};
		const blobs: string[] = [];

		const builder = new SummaryTreeBuilder();

		const data = this.kernel.getSerializedStorage(serializer);

		console.log(`mapIncrementalSummarizeCore: ${JSON.stringify(incrementalContext)}`);

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
		const keysInOrder = Object.keys(data).sort();
		for (const key of keysInOrder) {
			const value = data[key];
			if (value.value && value.value.length >= MinValueSizeSeparateSnapshotBlob) {
				counter++;
				const blobName = `blob${counter}`;
				counter++;
				blobs.push(blobName);
				const content: IMapDataObjectSerializable = {
					[key]: {
						type: value.type,
						value: JSON.parse(value.value) as unknown,
					},
				};
				const serializedContent = JSON.stringify(content);
				if (incrementalContext !== undefined) {
					const mapPath = `${incrementalContext.parentPath}`;
					addBlobOrHandle(
						mapPath,
						blobName,
						this.lastSummaryContent.get(blobName) ?? "",
						serializedContent,
						builder,
					);

					this.lastSummaryContent.set(blobName, serializedContent);
				} else {
					builder.addBlob(blobName, serializedContent);
				}
			} else {
				currentSize += value.type.length + 21; // Approximation cost of property header
				if (value.value) {
					currentSize += value.value.length;
				}

				if (currentSize > MaxSnapshotBlobSize) {
					const blobName = `blob${counter}`;
					counter++;
					blobs.push(blobName);
					const serializedContent = JSON.stringify(headerBlob);
					if (incrementalContext !== undefined) {
						const mapPath = `${incrementalContext.parentPath}`;
						addBlobOrHandle(
							mapPath,
							blobName,
							this.lastSummaryContent.get(blobName) ?? "",
							serializedContent,
							builder,
						);

						this.lastSummaryContent.set(blobName, serializedContent);
					} else {
						builder.addBlob(blobName, serializedContent);
					}
					headerBlob = {};
					currentSize = 0;
				}
				headerBlob[key] = {
					type: value.type,
					value:
						value.value === undefined
							? undefined
							: (JSON.parse(value.value) as unknown),
				};
			}
		}

		const header: IMapSerializationFormat = {
			blobs,
			content: headerBlob,
		};
		const headerSerialized = JSON.stringify(header);

		if (incrementalContext !== undefined) {
			const mapPath = `${incrementalContext.parentPath}`;
			addBlobOrHandle(
				mapPath,
				snapshotFileName,
				this.lastSummaryContent.get(snapshotFileName) ?? "",
				headerSerialized,
				builder,
			);

			this.lastSummaryContent.set(snapshotFileName, headerSerialized);
		} else {
			builder.addBlob(snapshotFileName, headerSerialized);
		}
		const tree = builder.getSummaryTree();
		console.log(JSON.stringify(tree));
		return tree;
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 * @internal
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
	 * @internal
	 */
	protected onDisconnect(): void {}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.reSubmitCore}
	 * @internal
	 */
	protected reSubmitCore(content: unknown, localOpMetadata: unknown): void {
		this.kernel.trySubmitMessage(content as IMapOperation, localOpMetadata);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObjectCore.applyStashedOp}
	 * @internal
	 */
	protected applyStashedOp(content: unknown): unknown {
		return this.kernel.tryApplyStashedOp(content as IMapOperation);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.processCore}
	 * @internal
	 */
	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		if (message.type === MessageType.Operation) {
			this.kernel.tryProcessMessage(
				message.contents as IMapOperation,
				local,
				localOpMetadata,
			);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.rollback}
	 * @internal
	 */
	protected rollback(content: unknown, localOpMetadata: unknown): void {
		this.kernel.rollback(content, localOpMetadata);
	}
}

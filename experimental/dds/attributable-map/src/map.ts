/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import {
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import {
	ISummaryTreeWithStats,
	ITelemetryContext,
	AttributionKey,
} from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import {
	IFluidSerializer,
	SharedObject,
	createSharedObjectKind,
} from "@fluidframework/shared-object-base/internal";

import { ISharedMap, ISharedMapEvents } from "./interfaces.js";
import {
	AttributableMapKernel,
	IMapDataObjectSerializable,
	IMapOperation,
} from "./mapKernel.js";
import { pkgVersion } from "./packageVersion.js";

interface IMapSerializationFormat {
	blobs?: string[];
	content: IMapDataObjectSerializable;
}

const snapshotFileName = "header";

/**
 * {@link @fluidframework/datastore-definitions#IChannelFactory} for {@link AttributableMap}.
 *
 * @sealed
 */
export class MapFactory implements IChannelFactory {
	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public static readonly Type = "https://graph.microsoft.com/types/map";

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public static readonly Attributes: IChannelAttributes = {
		type: MapFactory.Type,
		snapshotFormatVersion: "0.2",
		packageVersion: pkgVersion,
	};

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public get type(): string {
		return MapFactory.Type;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public get attributes(): IChannelAttributes {
		return MapFactory.Attributes;
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
		const map = new AttributableMapClass(id, runtime, attributes);
		await map.load(services);

		return map;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string): ISharedMap {
		const map = new AttributableMapClass(id, runtime, MapFactory.Attributes);
		map.initializeLocal();

		return map;
	}
}

/**
 * {@inheritDoc ISharedMap}
 * @internal
 */
export const AttributableMap = createSharedObjectKind(MapFactory);

/**
 * {@inheritDoc ISharedMap}
 */
export class AttributableMapClass
	extends SharedObject<ISharedMapEvents>
	implements ISharedMap
{
	/**
	 * String representation for the class.
	 */
	public readonly [Symbol.toStringTag]: string = "AttributableMap";

	/**
	 * MapKernel which manages actual map operations.
	 */
	private readonly kernel: AttributableMapKernel;

	/**
	 * Do not call the constructor. Instead, you should use the {@link AttributableMap.create | create method}.
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
		this.kernel = new AttributableMapKernel(
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
	 * Get the attribution of one entry through its key
	 * @param key - Key to track
	 * @returns The attribution of related entry
	 */
	public getAttribution(key: string): AttributionKey | undefined {
		return this.kernel.getAttribution(key);
	}

	/**
	 * Get all attribution of the map
	 * @returns All attribution in the map
	 */
	public getAllAttribution(): Map<string, AttributionKey> | undefined {
		return this.kernel.getAllAttribution();
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

		// If single property exceeds this size, it goes into its own blob.
		// Similar to below, there are no strict requirements for this value, but it should be reasonable.
		// And similar, it does not impact much efficiency, other than small blobs add overhead.
		const MinValueSizeSeparateSnapshotBlob = 128 * 1024;

		// Maximum blob size for multiple map properties
		// Should be bigger than MinValueSizeSeparateSnapshotBlob
		// There is no strict requirement for this value, but it should be reasonable.
		// Reasonably large, such that relative overhead of creating multiple blobs is not too high.
		// Reasonably small, such that we don't create so large blobs that storage system has to split them.
		// For example, ODSP stores content in 1Mb Azure blobs. That said, it stores compressed content, so the size of
		// blobs has only indirect impact on storage size.
		// Please note that smaller sizes increase the chances of blob reuse across summaries. That said
		// we have no code on client side to do such dedupping. Service side blob dedupping does not help much (we still transfer bites over wire).
		const MaxSnapshotBlobSize = 256 * 1024;

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
			if (
				value.value &&
				value.value.length + (value.attribution?.length ?? 0) >=
					MinValueSizeSeparateSnapshotBlob
			) {
				const blobName = `blob${counter}`;
				counter++;
				blobs.push(blobName);
				const content: IMapDataObjectSerializable = {
					[key]: {
						type: value.type,
						value: JSON.parse(value.value) as unknown,
						attribution:
							value.attribution === undefined ? undefined : JSON.parse(value.attribution),
					},
				};
				builder.addBlob(blobName, JSON.stringify(content));
			} else {
				currentSize += value.type.length + 21; // Approximation cost of property header
				if (value.value) {
					currentSize += value.value.length;
				}
				if (value.attribution) {
					currentSize += value.attribution.length;
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
					attribution:
						value.attribution === undefined ? undefined : JSON.parse(value.attribution),
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
		if (message.type === MessageType.Operation) {
			assert(
				this.kernel.tryProcessMessage(message, local, localOpMetadata),
				"AttributableMap received an unrecognized op, possibly from a newer version",
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

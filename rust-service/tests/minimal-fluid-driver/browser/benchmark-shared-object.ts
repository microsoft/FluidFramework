import type {
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IChannelStorageService,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import type {
	IRuntimeMessageCollection,
	ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions/internal";
import type {
	IFluidSerializer,
	ISharedObject,
	ISharedObjectEvents,
} from "@fluidframework/shared-object-base/internal";
import {
	SharedObject,
	createSharedObjectKind,
	createSingleBlobSummary,
} from "@fluidframework/shared-object-base/internal";

/** Event contract emitted after the benchmark object applies an operation. */
interface BenchmarkSharedObjectEvents extends ISharedObjectEvents {
	/** Registers a listener for the cumulative applied-operation count. */
	(event: "opApplied", listener: (appliedOpCount: number) => void): void;
}

/** Minimal SharedObject that counts representative operation payloads. */
export interface IBenchmarkSharedObject extends ISharedObject<BenchmarkSharedObjectEvents> {
	/** Number of local and remote operations applied by this client. */
	readonly appliedOpCount: number;
	/** Applies and submits one representative operation payload. */
	send(content: unknown): void;
}

/** Channel summary blob containing the persisted applied-operation count. */
const snapshotFileName = "header";

/** SharedObject implementation used to isolate Fluid runtime and service overhead. */
class BenchmarkSharedObjectClass
	extends SharedObject<BenchmarkSharedObjectEvents>
	implements IBenchmarkSharedObject
{
	/** Number of operations applied by this client. */
	private appliedCount = 0;

	/** Creates a benchmark channel with the supplied Fluid identity and attributes. */
	public constructor(
		id: string,
		private readonly dataStoreRuntime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
	) {
		super(id, dataStoreRuntime, attributes, "benchmark-shared-object");
	}

	/** Returns the cumulative applied-operation count. */
	public get appliedOpCount(): number {
		return this.appliedCount;
	}

	/** Applies locally, allocates one compressed ID, and submits the payload. */
	public send(content: unknown): void {
		const idCompressor = this.dataStoreRuntime.idCompressor;
		if (idCompressor === undefined) {
			throw new Error("benchmark SharedObject requires an ID compressor");
		}
		idCompressor.generateCompressedId();
		this.applyOperation();
		this.submitLocalMessage(content);
	}

	/** Persists the cumulative operation count in the channel summary. */
	protected summarizeCore(_serializer: IFluidSerializer): ISummaryTreeWithStats {
		return createSingleBlobSummary(
			snapshotFileName,
			JSON.stringify({ appliedOpCount: this.appliedCount }),
		);
	}

	/** Restores the cumulative operation count from channel storage. */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const content = JSON.parse(
			new TextDecoder().decode(await storage.readBlob(snapshotFileName)),
		) as { appliedOpCount: number };
		this.appliedCount = content.appliedOpCount;
	}

	/** Applies each remote operation in a sequenced message collection. */
	protected processMessagesCore(messagesCollection: IRuntimeMessageCollection): void {
		if (
			messagesCollection.envelope.type !== MessageType.Operation ||
			messagesCollection.local
		) {
			return;
		}
		for (const _message of messagesCollection.messagesContent) {
			this.applyOperation();
		}
	}

	/** Reapplies a stashed operation and resubmits its original payload. */
	protected applyStashedOp(content: unknown): void {
		this.applyOperation();
		this.submitLocalMessage(content);
	}

	/** Reverses the optimistic count when Fluid rolls back a local operation. */
	protected rollback(_content: unknown, _localOpMetadata: unknown): void {
		this.appliedCount--;
		this.emit("opApplied", this.appliedCount);
	}

	/** Requires no additional action when the channel disconnects. */
	protected onDisconnect(): void {}

	/** Increments the count and notifies benchmark adapters. */
	private applyOperation(): void {
		this.appliedCount++;
		this.emit("opApplied", this.appliedCount);
	}
}

/** Factory and persisted attributes for the benchmark SharedObject. */
class BenchmarkSharedObjectFactory implements IChannelFactory<IBenchmarkSharedObject> {
	/** Stable channel type identifier. */
	public static readonly Type =
		"https://graph.microsoft.com/types/fluid-benchmark-shared-object";
	/** Snapshot and package attributes persisted with the channel. */
	public static readonly Attributes: IChannelAttributes = {
		type: BenchmarkSharedObjectFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: "0.0.0",
	};

	/** Returns the stable channel type identifier. */
	public get type(): string {
		return BenchmarkSharedObjectFactory.Type;
	}

	/** Returns the persisted channel attributes. */
	public get attributes(): IChannelAttributes {
		return BenchmarkSharedObjectFactory.Attributes;
	}

	/** Loads and initializes a benchmark channel from storage. */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<IBenchmarkSharedObject> {
		const object = new BenchmarkSharedObjectClass(id, runtime, attributes);
		await object.load(services);
		return object;
	}

	/** Creates and locally initializes a new benchmark channel. */
	public create(runtime: IFluidDataStoreRuntime, id: string): IBenchmarkSharedObject {
		const object = new BenchmarkSharedObjectClass(id, runtime, this.attributes);
		object.initializeLocal();
		return object;
	}
}

/** SharedObject kind registered in the benchmark container schema. */
export const BenchmarkSharedObject = createSharedObjectKind<IBenchmarkSharedObject>(
	BenchmarkSharedObjectFactory,
);

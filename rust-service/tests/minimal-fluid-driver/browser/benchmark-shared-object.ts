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

interface BenchmarkSharedObjectEvents extends ISharedObjectEvents {
	(event: "opApplied", listener: (appliedOpCount: number) => void): void;
}

export interface IBenchmarkSharedObject extends ISharedObject<BenchmarkSharedObjectEvents> {
	readonly appliedOpCount: number;
	send(content: unknown): void;
}

const snapshotFileName = "header";

class BenchmarkSharedObjectClass
	extends SharedObject<BenchmarkSharedObjectEvents>
	implements IBenchmarkSharedObject
{
	private appliedCount = 0;

	public constructor(
		id: string,
		private readonly dataStoreRuntime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
	) {
		super(id, dataStoreRuntime, attributes, "benchmark-shared-object");
	}

	public get appliedOpCount(): number {
		return this.appliedCount;
	}

	public send(content: unknown): void {
		const idCompressor = this.dataStoreRuntime.idCompressor;
		if (idCompressor === undefined) {
			throw new Error("benchmark SharedObject requires an ID compressor");
		}
		idCompressor.generateCompressedId();
		this.applyOperation();
		this.submitLocalMessage(content);
	}

	protected summarizeCore(_serializer: IFluidSerializer): ISummaryTreeWithStats {
		return createSingleBlobSummary(
			snapshotFileName,
			JSON.stringify({ appliedOpCount: this.appliedCount }),
		);
	}

	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const content = JSON.parse(
			new TextDecoder().decode(await storage.readBlob(snapshotFileName)),
		) as { appliedOpCount: number };
		this.appliedCount = content.appliedOpCount;
	}

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

	protected applyStashedOp(content: unknown): void {
		this.applyOperation();
		this.submitLocalMessage(content);
	}

	protected rollback(_content: unknown, _localOpMetadata: unknown): void {
		this.appliedCount--;
		this.emit("opApplied", this.appliedCount);
	}

	protected onDisconnect(): void {}

	private applyOperation(): void {
		this.appliedCount++;
		this.emit("opApplied", this.appliedCount);
	}
}

class BenchmarkSharedObjectFactory implements IChannelFactory<IBenchmarkSharedObject> {
	public static readonly Type =
		"https://graph.microsoft.com/types/fluid-benchmark-shared-object";
	public static readonly Attributes: IChannelAttributes = {
		type: BenchmarkSharedObjectFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: "0.0.0",
	};

	public get type(): string {
		return BenchmarkSharedObjectFactory.Type;
	}

	public get attributes(): IChannelAttributes {
		return BenchmarkSharedObjectFactory.Attributes;
	}

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

	public create(runtime: IFluidDataStoreRuntime, id: string): IBenchmarkSharedObject {
		const object = new BenchmarkSharedObjectClass(id, runtime, this.attributes);
		object.initializeLocal();
		return object;
	}
}

export const BenchmarkSharedObject = createSharedObjectKind<IBenchmarkSharedObject>(
	BenchmarkSharedObjectFactory,
);

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	DataObject,
	DataObjectFactory,
	createDataObject,
	type DataObjectTypes,
	type IDataObjectProps,
} from "@fluidframework/aqueduct/internal";
import type { FluidObject } from "@fluidframework/core-interfaces";
import {
	FluidDataStoreRuntime,
	type DataStoreMessageType,
	type ISharedObjectRegistry,
} from "@fluidframework/datastore/internal";
import type {
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { type ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import type {
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	ISummaryTreeWithStats,
	ITelemetryContext,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";
import { addBlobToSummary } from "@fluidframework/runtime-utils/internal";
import type { FluidObjectSymbolProvider } from "@fluidframework/synthesize/internal";

export interface IMigrationDataObjectProps<I extends DataObjectTypes = DataObjectTypes>
	extends IDataObjectProps<I> {
	readonly runtime: MigrationFluidDataStoreRuntime;
}

export class MigrationDataObjectFactory<
	TObj extends MigrationDataObject<I>,
	I extends DataObjectTypes = DataObjectTypes,
> extends DataObjectFactory<TObj, I> {
	constructor(
		type: string,
		ctor: new (props: IMigrationDataObjectProps<I>) => TObj,
		sharedObjects: readonly IChannelFactory[] = [],
		optionalProviders: FluidObjectSymbolProvider<I["OptionalProviders"]>,
		registryEntries?: NamedFluidDataStoreRegistryEntries,
		protected runtimeFactory: typeof MigrationFluidDataStoreRuntime = MigrationFluidDataStoreRuntime,
	) {
		const ctorCasted = ctor as new (props: IDataObjectProps<I>) => TObj;
		super(type, ctorCasted, sharedObjects, optionalProviders, registryEntries, runtimeFactory);
	}

	public async instantiateDataStore(
		context: IFluidDataStoreContext,
		existing: boolean,
	): Promise<IFluidDataStoreChannel> {
		const { runtime, instance } = await createDataObject(
			this.ctor,
			context,
			this.sharedObjectRegistry,
			this.optionalProviders,
			this.runtimeFactory,
			existing,
		);

		await instance.initializeMigrationData();
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return runtime;
	}
}

export abstract class MigrationDataObject<
	I extends DataObjectTypes = DataObjectTypes,
> extends DataObject<I> {
	public readonly runtime: MigrationFluidDataStoreRuntime;
	public constructor(props: IMigrationDataObjectProps<I>) {
		super(props);
		this.runtime = props.runtime;
		this.runtime.migrate = this.migrate.bind(this);
	}
	protected abstract migrate(): void;

	// This is needed because we need to have the DDS/channels available before we can process a migrate op.
	protected abstract initializeForMigration(): Promise<void>;

	public async initializeMigrationData(): Promise<void> {
		if (this.runtime.versionBlobId !== undefined) {
			this.runtime.version = await readAndParse<string>(
				this.context.storage,
				this.runtime.versionBlobId,
			);
		}
		await this.initializeForMigration();
	}
}

export type MigrateMessageType = "migrateLeave";
export const MigrateMessageType: MigrateMessageType = "migrateLeave";

export interface IMigrateMessage {
	version: string;
}

export class MigrationFluidDataStoreRuntime extends FluidDataStoreRuntime {
	public version?: string;
	public versionBlobId?: string;
	constructor(
		dataStoreContext: IFluidDataStoreContext,
		sharedObjectRegistry: ISharedObjectRegistry,
		existing: boolean,
		provideEntryPoint: (runtime: IFluidDataStoreRuntime) => Promise<FluidObject>,
	) {
		super(dataStoreContext, sharedObjectRegistry, existing, provideEntryPoint);
		const tree = dataStoreContext.baseSnapshot;
		if (tree?.blobs !== undefined) {
			const schemaVersion = tree.blobs._schemaVersion;
			if (schemaVersion !== undefined) {
				this.versionBlobId = schemaVersion;
			}
		}
	}

	public removeChannel(channelId: string): void {
		this.deleteChannel(channelId);
	}

	private migrateMessage: ISequencedDocumentMessage | undefined;
	// should be more of a set migrate function or something like that
	public migrate?(): void;

	public process(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		this.verifyNotClosed();
		// Because this is a prototype, what we would really want to do is to pay attention to whether or not we can pass information or expose apis to the runtime to allow it to migrate the data object when the latest "leave" message is received.
		if (message.type === MigrateMessageType) {
			assert(
				this.migrate !== undefined,
				"Migrate message received but migrate function not defined",
			);
			const migrateContents = message.contents as IMigrateMessage;
			assert(
				this.version !== migrateContents.version,
				"Migrate message received with same version",
			);
			this.version = migrateContents.version;
			this.migrateMessage = message;
			this.migrate();
			this.migrateMessage = undefined;
			return;
		}

		super.process(message, local, localOpMetadata);
	}

	public submitMigrateMessage(version: string): void {
		const content: IMigrateMessage = { version };
		this.submit(MigrateMessageType, content, undefined);
	}

	protected submit(
		type: DataStoreMessageType | MigrateMessageType,
		content: any,
		localOpMetadata: unknown,
	): void {
		if (this.migrateMessage !== undefined) {
			this.process(
				{
					type,
					contents: content,
					clientId: this.migrateMessage.clientId,
					sequenceNumber: this.migrateMessage.sequenceNumber,
					minimumSequenceNumber: this.migrateMessage.minimumSequenceNumber,
					clientSequenceNumber: this.migrateMessage.clientSequenceNumber,
					referenceSequenceNumber: this.migrateMessage.referenceSequenceNumber,
					timestamp: this.migrateMessage.timestamp,
				},
				true,
				localOpMetadata,
			);
			return;
		}
		super.submit(type as DataStoreMessageType, content, localOpMetadata);
	}

	public reSubmit(
		type: DataStoreMessageType | MigrateMessageType,
		content: any,
		localOpMetadata: unknown,
	): void {
		this.verifyNotClosed();
		if (type === MigrateMessageType) {
			this.submit(type, content, localOpMetadata);
			return;
		}
		super.reSubmit(type, content, localOpMetadata);
	}

	public async summarize(
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		const summary = await super.summarize(fullTree, trackState, telemetryContext);
		if (this.version !== undefined) {
			addBlobToSummary(summary, "_schemaVersion", JSON.stringify(this.version));
		}
		return summary;
	}
}

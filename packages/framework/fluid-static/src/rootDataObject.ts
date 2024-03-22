/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	BaseContainerRuntimeFactory,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import { type IRuntimeFactory } from "@fluidframework/container-definitions";
import {
	CompressionAlgorithms,
	type ContainerRuntime,
	type IContainerRuntimeOptions,
} from "@fluidframework/container-runtime";
import { type IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import {
	type FluidObject,
	type IFluidLoadable,
	type IRequest,
	type IResponse,
} from "@fluidframework/core-interfaces";
import { unreachableCase } from "@fluidframework/core-utils";
import { type IDirectory } from "@fluidframework/map";
import { FlushMode } from "@fluidframework/runtime-definitions";
import { RequestParser } from "@fluidframework/runtime-utils";
import type { ISharedObjectKind } from "@fluidframework/shared-object-base";
import {
	type ContainerSchema,
	FluidRuntimeMinVersion,
	type IRootDataObject,
	type LoadableObjectClass,
	type LoadableObjectClassRecord,
	type LoadableObjectRecord,
} from "./types.js";
import {
	type InternalDataObjectClass,
	isDataObjectClass,
	isSharedObjectKind,
	parseDataObjectsFromSharedObjects,
} from "./utils.js";

/**
 * Input props for {@link RootDataObject.initializingFirstTime}.
 */
export interface RootDataObjectProps {
	/**
	 * Initial object structure with which the {@link RootDataObject} will be first-time initialized.
	 *
	 * @see {@link RootDataObject.initializingFirstTime}
	 */
	initialObjects: LoadableObjectClassRecord;
}

/**
 * The entry-point/root collaborative object of the {@link IFluidContainer | Fluid Container}.
 * Abstracts the dynamic code required to build a Fluid Container into a static representation for end customers.
 */
class RootDataObject
	extends DataObject<{ InitialState: RootDataObjectProps }>
	implements IRootDataObject
{
	private readonly initialObjectsDirKey = "initial-objects-key";
	private readonly _initialObjects: LoadableObjectRecord = {};

	public get IRootDataObject(): IRootDataObject {
		return this;
	}

	private get initialObjectsDir(): IDirectory {
		const dir = this.root.getSubDirectory(this.initialObjectsDirKey);
		if (dir === undefined) {
			throw new Error("InitialObjects sub-directory was not initialized");
		}
		return dir;
	}

	/**
	 * The first time this object is initialized, creates each object identified in
	 * {@link RootDataObjectProps.initialObjects} and stores them as unique values in the root directory.
	 *
	 * @see {@link @fluidframework/aqueduct#PureDataObject.initializingFirstTime}
	 */
	protected async initializingFirstTime(props: RootDataObjectProps): Promise<void> {
		this.root.createSubDirectory(this.initialObjectsDirKey);

		// Create initial objects provided by the developer
		const initialObjectsP: Promise<void>[] = [];
		for (const [id, objectClass] of Object.entries(props.initialObjects)) {
			const createObject = async (): Promise<void> => {
				const obj = await this.create<IFluidLoadable>(objectClass);
				this.initialObjectsDir.set(id, obj.handle);
			};
			initialObjectsP.push(createObject());
		}

		await Promise.all(initialObjectsP);
	}

	/**
	 * Every time an instance is initialized, loads all of the initial objects in the root directory so they can be
	 * accessed immediately.
	 *
	 * @see {@link @fluidframework/aqueduct#PureDataObject.hasInitialized}
	 */
	protected async hasInitialized(): Promise<void> {
		// We will always load the initial objects so they are available to the developer
		const loadInitialObjectsP: Promise<void>[] = [];
		for (const [key, value] of this.initialObjectsDir.entries()) {
			const loadDir = async (): Promise<void> => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
				const obj: unknown = await value.get();
				Object.assign(this._initialObjects, { [key]: obj });
			};
			loadInitialObjectsP.push(loadDir());
		}

		await Promise.all(loadInitialObjectsP);
	}

	/**
	 * {@inheritDoc IRootDataObject.initialObjects}
	 */
	public get initialObjects(): LoadableObjectRecord {
		if (Object.keys(this._initialObjects).length === 0) {
			throw new Error("Initial Objects were not correctly initialized");
		}
		return this._initialObjects;
	}

	/**
	 * {@inheritDoc IRootDataObject.create}
	 */
	public async create<T extends IFluidLoadable>(objectClass: LoadableObjectClass<T>): Promise<T> {
		if (isDataObjectClass(objectClass)) {
			return this.createDataObject(objectClass);
		} else if (isSharedObjectKind(objectClass)) {
			return this.createSharedObject(objectClass);
		}
		throw new Error("Could not create new Fluid object because an unknown object was passed");
	}

	private async createDataObject<T extends IFluidLoadable>(
		dataObjectClass: InternalDataObjectClass<T>,
	): Promise<T> {
		const factory = dataObjectClass.factory;
		const packagePath = [...this.context.packagePath, factory.type];
		const dataStore = await this.context.containerRuntime.createDataStore(packagePath);
		const entryPoint = await dataStore.entryPoint.get();
		return entryPoint as unknown as T;
	}

	private createSharedObject<T extends IFluidLoadable>(
		sharedObjectClass: ISharedObjectKind<T>,
	): T {
		const factory = sharedObjectClass.getFactory();
		const obj = this.runtime.createChannel(undefined, factory.type);
		return obj as unknown as T;
	}
}

const rootDataStoreId = "rootDOId";

/**
 * Creates an {@link @fluidframework/aqueduct#BaseContainerRuntimeFactory} for a container with a single
 * {@link IRootDataObject}, which is constructed from the provided schema.
 *
 * @internal
 */
export function createDOProviderContainerRuntimeFactory(props: {
	schema: ContainerSchema;
	minRuntimeVersion?: FluidRuntimeMinVersion;
}): IRuntimeFactory {
	return new DOProviderContainerRuntimeFactory(props.schema, props.minRuntimeVersion);
}

/**
 * Container code that provides a single {@link IRootDataObject}.
 *
 * @remarks
 *
 * This data object is dynamically customized (registry and initial objects) based on the schema provided.
 * to the container runtime factory.
 *
 * @internal
 */
class DOProviderContainerRuntimeFactory extends BaseContainerRuntimeFactory {
	private readonly rootDataObjectFactory: DataObjectFactory<
		RootDataObject,
		{
			InitialState: RootDataObjectProps;
		}
	>;

	private readonly initialObjects: LoadableObjectClassRecord;

	public constructor(
		schema: ContainerSchema,
		minRuntimeVersion: FluidRuntimeMinVersion = FluidRuntimeMinVersion.V2,
	) {
		const [registryEntries, sharedObjects] = parseDataObjectsFromSharedObjects(schema);
		const rootDataObjectFactory = new DataObjectFactory(
			"rootDO",
			RootDataObject,
			sharedObjects,
			{},
			registryEntries,
		);
		const provideEntryPoint = async (
			containerRuntime: IContainerRuntime,
			// eslint-disable-next-line unicorn/consistent-function-scoping
		): Promise<FluidObject> => {
			const entryPoint =
				await containerRuntime.getAliasedDataStoreEntryPoint(rootDataStoreId);
			if (entryPoint === undefined) {
				throw new Error(`default dataStore [${rootDataStoreId}] must exist`);
			}
			return entryPoint.get();
		};
		const getDefaultObject = async (
			request: IRequest,
			runtime: IContainerRuntime,
			// eslint-disable-next-line unicorn/consistent-function-scoping
		): Promise<IResponse | undefined> => {
			const parser = RequestParser.create(request);
			if (parser.pathParts.length === 0) {
				// This cast is safe as ContainerRuntime.loadRuntime is called in the base class
				return (runtime as ContainerRuntime).resolveHandle({
					url: `/${rootDataStoreId}${parser.query}`,
					headers: request.headers,
				});
			}
			return undefined; // continue search
		};

		let runtimeOptions: IContainerRuntimeOptions;

		switch (minRuntimeVersion) {
			case FluidRuntimeMinVersion.V1: {
				runtimeOptions = {
					// Legacy - work around for inability to send over 1Mb batches.
					// Very risky, as exposes app (remote clients) to intermidiate states.
					flushMode: FlushMode.Immediate,
					// New type of op - not compatible
					compressionOptions: {
						minimumBatchSizeInBytes: Number.POSITIVE_INFINITY, // disabled
						compressionAlgorithm: CompressionAlgorithms.lz4,
					},
					// New type of op - not compatible
					enableGroupedBatching: false,
				};
				break;
			}
			case FluidRuntimeMinVersion.V2: {
				runtimeOptions = {
					// FlushMode.Immediate has been depreceated. It leads to subtle bugs in applications, as
					// intermidiate states are exposed to remote clients half way through operations.
					// It also results in op compressionto to not be very effective (as it compresses individual ops, not batches of ops)
					flushMode: FlushMode.TurnBased,
					// Id Compressor is required for SharedTree scenarios. This is breaking change (even if SharedTree is not used) - this
					// setting results in new type of ops that 1.3.x clients do not understand.
					enableRuntimeIdCompressor: "on",
					// Enable op grouping. This allows us to substantially reduce number of ops on the wire,
					// and thus reduce cost for users. A batch of 1000 ops is very likely (with op compresison and op chunking) to be just
					// couple ops on the wire.
					// This also ensures that client does not trip (with relatively small to medium payloads) over service throttling limits easily.
					enableGroupedBatching: true,
					// chunkSizeInBytes - is on by default.
					// compressionOptions - default is on
				};
				break;
			}
			default: {
				unreachableCase(minRuntimeVersion, "unknown version");
			}
		}
		super({
			registryEntries: [rootDataObjectFactory.registryEntry],
			requestHandlers: [getDefaultObject],
			runtimeOptions,
			provideEntryPoint,
		});
		this.rootDataObjectFactory = rootDataObjectFactory;
		this.initialObjects = schema.initialObjects;
	}

	/**
	 * {@inheritDoc @fluidframework/aqueduct#BaseContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void> {
		// The first time we create the container we create the RootDataObject
		await this.rootDataObjectFactory.createRootInstance(rootDataStoreId, runtime, {
			initialObjects: this.initialObjects,
		});
	}
}

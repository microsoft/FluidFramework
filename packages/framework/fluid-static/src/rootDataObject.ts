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
import { type ContainerRuntime, disabledCompressionConfig } from "@fluidframework/container-runtime";
import { type IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import {
	type FluidObject,
	type IFluidLoadable,
	type IRequest,
	type IResponse,
} from "@fluidframework/core-interfaces";
import { type IDirectory } from "@fluidframework/map";
import { FlushMode } from "@fluidframework/runtime-definitions";
import { RequestParser } from "@fluidframework/runtime-utils";

import {
	type ContainerSchema,
	type IRootDataObject,
	type LoadableObjectClass,
	type LoadableObjectClassRecord,
	type LoadableObjectRecord,
	type SharedObjectClass,
} from "./types.js";
import {
	type InternalDataObjectClass,
	isDataObjectClass,
	isSharedObjectClass,
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
			return this.createDataObject<T>(objectClass);
		} else if (isSharedObjectClass(objectClass)) {
			return this.createSharedObject<T>(objectClass);
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
		sharedObjectClass: SharedObjectClass<T>,
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
}): IRuntimeFactory {
	return new DOProviderContainerRuntimeFactory(props.schema);
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

	public constructor(schema: ContainerSchema) {
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
		super({
			registryEntries: [rootDataObjectFactory.registryEntry],
			requestHandlers: [getDefaultObject],
			runtimeOptions: {
				// temporary workaround to disable message batching until the message batch size issue is resolved
				// resolution progress is tracked by the Feature 465 work item in AzDO
				flushMode: FlushMode.Immediate,
				// While runtime compressor is required to be on to use @fluidframework/tree,
				// it can't be enabled for 1.3 documents (as they do not understand ID compressor ops; neither they understand Tree ops)
				// Clients have two choices when it comes to enabling Tree scenarios:
				// 1) If client has no 1.3 documents / sessions (i.e. it's a new client who is starting with 2.0), such client should supply different
				//    config that enables ID compressor, Tree, Op compression, Op grouping, FlushMode.TurnBased, etc. I.e. get all the benefits of 2.0 at once!
				// 2) if client has 1.3 in production, it will require proper data migration story from old schema to new, and only after
				//    it is safe to do so, i.e. application with FF 2.0 has been deployed and saturated in the market.
				// enableRuntimeIdCompressor: "on",
				explicitSchemaControl: true,
				compressionOptions: disabledCompressionConfig,
			},
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

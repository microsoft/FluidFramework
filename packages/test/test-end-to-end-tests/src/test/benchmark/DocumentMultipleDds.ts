import { strict as assert } from "assert";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import { SharedMap } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IContainer } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IDocumentLoader, IDocumentProps } from "./DocumentCreator";

class TestDataObject extends DataObject {
	public get _root() {
		return this.root;
	}

	public get _context() {
		return this.context;
	}

	private readonly mapKey = "map";
	public map!: SharedMap;

	private readonly sharedStringKey = "sharedString";
	public sharedString!: SharedString;

	protected async initializingFirstTime() {
		const sharedMap = SharedMap.create(this.runtime);
		this.root.set(this.mapKey, sharedMap.handle);

		const sharedString = SharedString.create(this.runtime);
		this.root.set(this.sharedStringKey, sharedString.handle);
	}

	protected async hasInitialized() {
		const mapHandle = this.root.get<IFluidHandle<SharedMap>>(this.mapKey);
		assert(mapHandle !== undefined, "SharedMap not found");
		this.map = await mapHandle.get();

		const sharedStringHandle = this.root.get<IFluidHandle<SharedString>>(this.sharedStringKey);
		assert(sharedStringHandle !== undefined, "SharedMatrix not found");
		this.sharedString = await sharedStringHandle.get();
	}
}

const runtimeOptions: IContainerRuntimeOptions = {
	summaryOptions: {
		summaryConfigOverrides: {
			state: "disabled",
		},
	},
};

// implement IDocumentLoader methods
export class DocumentMultipleDds implements IDocumentLoader {
	private _mainContainer: IContainer | undefined;
	private containerRuntime: ContainerRuntime | undefined;
	private mainDataStore: TestDataObject | undefined;
	private readonly dsCounts: number = 1500;
	private readonly dsCountPerIteration: number = 500;
	private readonly _dataObjectFactory = new DataObjectFactory(
		"TestDataObject",
		TestDataObject,
		[SharedMap.getFactory(), SharedString.getFactory()],
		[],
	);
	public get dataObjectFactory() {
		return this._dataObjectFactory;
	}
	private readonly runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
		this.dataObjectFactory,
		[[this.dataObjectFactory.type, Promise.resolve(this.dataObjectFactory)]],
		undefined,
		undefined,
		runtimeOptions,
	);

	public get mainContainer() {
		return this._mainContainer;
	}
	public get logger() {
		return this.props.logger;
	}

	private async ensureContainerConnectedWriteMode(container: Container): Promise<void> {
		const resolveIfActive = (res: () => void) => {
			if (container.deltaManager.active) {
				res();
			}
		};
		if (!container.deltaManager.active) {
			await new Promise<void>((resolve) =>
				container.on("connected", () => resolveIfActive(resolve)),
			);
			container.off("connected", resolveIfActive);
		}
	}

	private async createDataStores() {
		assert(
			this._mainContainer !== undefined,
			"Container should be initialized before creating data stores",
		);
		assert(
			this.containerRuntime !== undefined,
			"ContainerRuntime should be initialized before creating data stores",
		);
		assert(
			this.mainDataStore !== undefined,
			"mainDataStore should be initialized before creating data stores",
		);
		const totalIterations = this.dsCounts / this.dsCountPerIteration;
		for (let i = 0; i < totalIterations; i++) {
			for (let j = 0; j < this.dsCountPerIteration; j++) {
				const dataStore = await this.dataObjectFactory.createInstance(
					this.containerRuntime,
				);
				this.mainDataStore._root.set(`dataStore${j}`, dataStore.handle);
			}
			await this.waitForContainerSave(this._mainContainer);
		}
	}

	private async waitForContainerSave(c: IContainer) {
		if (!c.isDirty) {
			return;
		}
		await new Promise<void>((resolve) => c.on("saved", () => resolve()));
	}

	/**
	 * Creates a new DocumentCreator using configuration parameters.
	 * @param props - Properties for initializing the Document Creator.
	 * @param numberOfKeysInMap - Size of the document to be created 1=5Mb, 2=10Mb, etc.
	 */
	public constructor(private readonly props: IDocumentProps) {
		switch (this.props.documentType) {
			case "MediumDocumentMultipleDDSs":
				this.dsCounts = 1500;
				this.dsCountPerIteration = 500;
				break;
			case "LargeDocumentMultipleDDSs":
				this.dsCounts = 2000;
				this.dsCountPerIteration = 500;
				break;
			default:
				throw new Error("Invalid document type");
		}
	}

	public async initializeDocument(): Promise<void> {
		this._mainContainer = await this.props.provider.createContainer(this.runtimeFactory);
		this.mainDataStore = await requestFluidObject<TestDataObject>(this._mainContainer, "/");
		this.containerRuntime = this.mainDataStore._context.containerRuntime as ContainerRuntime;
		this.mainDataStore._root.set("mode", "write");
		await this.ensureContainerConnectedWriteMode(this._mainContainer as Container);
		await this.createDataStores();
	}

	public async loadDocument(): Promise<IContainer> {
		assert(
			this._mainContainer !== undefined,
			"Container should be initialized before loadDocument",
		);
		return this._mainContainer;
	}
}

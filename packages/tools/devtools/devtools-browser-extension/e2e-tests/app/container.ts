/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory } from "@fluid-example/example-utils";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/internal";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import { SharedString } from "@fluidframework/sequence/internal";

export interface ICollaborativeTextAppModel {
	readonly collaborativeText: CollaborativeText;
	readonly container: IContainer;
	readonly runtime: IContainerRuntime;
}

export class CollaborativeTextAppModel implements ICollaborativeTextAppModel {
	public constructor(
		public readonly collaborativeText: CollaborativeText,
		public readonly container: IContainer,
		public readonly runtime: IContainerRuntime,
	) {}
}

const collaborativeTextId = "collaborative-text";

export class CollaborativeTextContainerRuntimeFactory extends ModelContainerRuntimeFactory<ICollaborativeTextAppModel> {
	constructor() {
		super(
			new Map([CollaborativeText.getFactory().registryEntry]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const collaborativeText = await runtime.createDataStore(
			CollaborativeText.getFactory().type,
		);
		await collaborativeText.trySetAlias(collaborativeTextId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		const entryPointHandle = (await runtime.getAliasedDataStoreEntryPoint(
			collaborativeTextId,
		)) as IFluidHandle<CollaborativeText> | undefined;

		if (entryPointHandle === undefined) {
			throw new Error(`Default dataStore [${collaborativeTextId}] must exist`);
		}

		return new CollaborativeTextAppModel(await entryPointHandle.get(), container, runtime);
	}
}

/**
 * CollaborativeText uses the React CollaborativeTextArea to load a collaborative HTML <textarea>
 */
class CollaborativeText extends DataObject {
	private readonly textKey = "textKey";
	private readonly _initialObjects: Record<string, IFluidLoadable> = {};

	private _text: SharedString | undefined;
	public get text() {
		if (this._text === undefined) {
			throw new Error("The SharedString was not initialized correctly");
		}
		return this._text;
	}

	public get initialObjects(): Record<string, IFluidLoadable> {
		return this._initialObjects;
	}

	public static get Name() {
		return "browser-extension-test-app";
	}

	private static readonly factory = new DataObjectFactory({
		type: CollaborativeText.name,
		ctor: CollaborativeText,
		sharedObjects: [SharedString.getFactory()],
	});

	public static getFactory() {
		return this.factory;
	}

	protected async initializingFirstTime() {
		// Create the SharedString and store the handle in our root SharedDirectory
		const text = SharedString.create(this.runtime);
		this.root.set(this.textKey, text.handle);
		this._initialObjects[this.textKey] = text.IFluidLoadable;
	}

	protected async hasInitialized() {
		// Store the text if we are loading the first time or loading from existing
		this._text = await this.root.get<IFluidHandle<SharedString>>(this.textKey)?.get();
	}
}

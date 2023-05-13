/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
// eslint-disable-next-line import/no-internal-modules
import ReactDOM from "react-dom/client";
import { v4 as uuid } from "uuid";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { PlayerData } from "./PlayerData";
import { ReactView } from "./view";
import { LocalPlayer } from "./Player";
const playerDataRegistry = "playerData";
class GameDataObject extends DataObject {
	public get _root() {
		return this.root;
	}
}
const defaultDataObjectFactory = new DataObjectFactory("GameDataObject", GameDataObject, [], []);
const playerDataObjectFactory = new DataObjectFactory(playerDataRegistry, PlayerData, [], []);
export class CollaborativeTextContainerRuntimeFactory extends ContainerRuntimeFactoryWithDefaultDataStore {
	constructor() {
		super(
			defaultDataObjectFactory,
			[
				[defaultDataObjectFactory.type, Promise.resolve(defaultDataObjectFactory)],
				[playerDataObjectFactory.type, Promise.resolve(playerDataObjectFactory)],
			], // registryEntries
		);
	}

	protected async containerHasInitialized(runtime: IContainerRuntime) {
		const dataStore = await runtime.createDataStore(playerDataObjectFactory.type);
		const playerId = uuid();
		const playerData = (await dataStore.entryPoint?.get()) as PlayerData;
		playerData.playerId = playerId;
		const defaultRouter = await runtime.getRootDataStore("default");
		const defaultDataStore = await requestFluidObject<GameDataObject>(defaultRouter, "default");
		defaultDataStore._root.set(playerData.playerId, playerData.handle);
		const localPlayer = new LocalPlayer(playerData);
		const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
		root.render(
			<React.StrictMode>
				<ReactView localPlayer={localPlayer} playerMap={defaultDataStore._root} />
			</React.StrictMode>,
		);
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { ModelLoader } from "./modelLoader";
import { externalDataSource } from "./externalData";
import { IMigratable } from "./interfaces";
import { Migrator } from "./migrator";
import { InventoryListContainer as InventoryListContainer1 } from "./version1";
import { InventoryListContainer as InventoryListContainer2 } from "./version2";
import { DebugView, InventoryListContainerView } from "./view";

const updateTabForId = (id: string) => {
    // Update the URL with the actual ID
    location.hash = id;

    // Put the ID in the tab title
    document.title = id;
};

const isInventoryListContainer1 = (model: IMigratable): model is InventoryListContainer1 => {
    return model.version === "one";
};

const isInventoryListContainer2 = (model: IMigratable): model is InventoryListContainer2 => {
    return model.version === "two";
};

const render = (model: IMigratable) => {
    // The InventoryListContainerView is what a normal user would see in a normal scenario...
    const appDiv = document.getElementById("app") as HTMLDivElement;
    ReactDOM.unmountComponentAtNode(appDiv);
    // This demo uses the same view for both versions 1 & 2 - if we wanted to use different views for different model
    // versions, we could check its version here and select the appropriate view.
    if (isInventoryListContainer1(model) || isInventoryListContainer2(model)) {
        ReactDOM.render(
            React.createElement(InventoryListContainerView, { model }),
            appDiv,
        );
    } else {
        throw new Error(`Don't know how to render version ${model.version}`);
    }

    // Whereas the DebugView is just for the purposes of this demo.  Separated out here to clarify the division.
    const debugDiv = document.getElementById("debug") as HTMLDivElement;
    ReactDOM.unmountComponentAtNode(debugDiv);
    ReactDOM.render(
        React.createElement(DebugView, {
            model,
        }),
        debugDiv,
    );
};

async function start(): Promise<void> {
    let id: string;
    let model: IMigratable;
    const modelLoader = new ModelLoader();

    // In interacting with the service, we need to be explicit about whether we're creating a new container vs.
    // loading an existing one.  If loading, we also need to provide the unique ID for the container we are
    // loading from.

    // In this app, we'll choose to create a new container when navigating directly to http://localhost:8080.
    // A newly created container will generate its own ID, which we'll place in the URL hash.
    // If navigating to http://localhost:8080#containerId, we'll load from the ID in the hash.

    // These policy choices are arbitrary for demo purposes, and can be changed however you'd like.
    if (location.hash.length === 0) {
        // Fetching and importing the data here is optional
        // For demo purposes it's nice to have some prepopulated entries though.
        const fetchedData = await externalDataSource.fetchData();
        // Choosing to create with the old version for demo purposes, so we can demo the upgrade flow.
        // Normally we would create with the most-recent version.
        const createResponse = await modelLoader.createDetached("one");
        model = createResponse.model;
        // TODO: Validate that the model is capable of importing the fetchedData (format check)
        await model.importStringData(fetchedData);
        id = await createResponse.attach();
    } else {
        id = location.hash.substring(1);
        model = await modelLoader.loadExisting(id);
    }

    // TODO: here I proceed to rendering without waiting to see if an upgrade is needed, but instead we could
    // check first and defer rendering until the upgrade is complete.  Consider whether this would be better.

    // Could be reasonable to merge Migrator into the ModelLoader, for a MigratingModelLoader.
    const migrator = new Migrator(modelLoader, model);
    migrator.on("migrated", (newModel: IMigratable, newModelId: string) => {
        render(newModel);
        updateTabForId(newModelId);
    });
    migrator.on("migrationNotSupported", (version: string) => {
        // TODO: Figure out what a reasonable end-user experience might be in this case.
        console.error(`Tried to migrate to version ${version} which is not supported by the current ModelLoader`);
    });

    render(model);
    updateTabForId(id);
}

start().catch((error) => console.error(error));

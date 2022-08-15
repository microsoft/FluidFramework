/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { createTinyliciousCreateNewRequest } from "@fluidframework/tinylicious-driver";
import { DemoCodeLoader } from "./demoLoaders";
import { ModelLoader } from "./modelLoading";
import { externalDataSource } from "./externalData";
import { IMigratableModel, IVersionedModel } from "./migrationInterfaces";
import { Migrator } from "./migrator";
import { IInventoryListContainer } from "./modelInterfaces";
import { TinyliciousService } from "./tinyliciousService";
import { DebugView, InventoryListContainerView } from "./view";

const updateTabForId = (id: string) => {
    // Update the URL with the actual ID
    location.hash = id;

    // Put the ID in the tab title
    document.title = id;
};

const isIInventoryListContainer = (model: IVersionedModel): model is IInventoryListContainer => {
    return model.version === "one" || model.version === "two";
};

const getUrlForContainerId = (containerId: string) => `/#${containerId}`;

const render = (model: IVersionedModel) => {
    const appDiv = document.getElementById("app") as HTMLDivElement;
    ReactDOM.unmountComponentAtNode(appDiv);
    // This demo uses the same view for both versions 1 & 2 - if we wanted to use different views for different model
    // versions, we could check its version here and select the appropriate view.  Or we could even write ourselves a
    // view code loader to pull in the view dynamically based on the version we discover.
    if (isIInventoryListContainer(model)) {
        ReactDOM.render(
            React.createElement(InventoryListContainerView, { model }),
            appDiv,
        );
    } else {
        throw new Error(`Don't know how to render version ${model.version}`);
    }

    // The DebugView is just for demo purposes, to manually control code proposal and inspect the state.
    const debugDiv = document.getElementById("debug") as HTMLDivElement;
    ReactDOM.unmountComponentAtNode(debugDiv);
    ReactDOM.render(
        React.createElement(DebugView, {
            model,
            getUrlForContainerId,
        }),
        debugDiv,
    );
};

async function start(): Promise<void> {
    const tinyliciousService = new TinyliciousService();

    // If we assumed the container code could consistently present a model to us, we could bake that assumption
    // in here as well as in the Migrator -- both places just need a reliable way to get a model regardless of the
    // (unknown) container version.  So the ModelLoader would be replaced by whatever the consistent request call
    // (e.g. container.request({ url: "mode" })) looks like.
    const modelLoader = new ModelLoader<IMigratableModel>({
        urlResolver: tinyliciousService.urlResolver,
        documentServiceFactory: tinyliciousService.documentServiceFactory,
        codeLoader: new DemoCodeLoader(),
        generateCreateNewRequest: createTinyliciousCreateNewRequest,
    });

    let id: string;
    let model: IMigratableModel;

    if (location.hash.length === 0) {
        // Choosing to create with the "old" version for demo purposes, so we can demo the upgrade flow.
        // Normally we would create with the most-recent version.
        const createResponse = await modelLoader.createDetached("one");
        model = createResponse.model;

        // Fetching and importing the data here is optional
        // For demo purposes it's nice to have some prepopulated entries though.
        const fetchedData = await externalDataSource.fetchData();
        if (!model.supportsDataFormat(fetchedData)) {
            throw new Error("Model doesn't support fetched data format");
        }
        await model.importData(fetchedData);

        id = await createResponse.attach();
    } else {
        id = location.hash.substring(1);
        model = await modelLoader.loadExisting(id);
    }

    // The Migrator takes the starting state (model and id) and watches for a migration proposal.  It encapsulates
    // the migration logic and just lets us know when a new model is loaded and available (with the "migrated" event).
    const migrator = new Migrator(modelLoader, model, id);
    migrator.on("migrated", () => {
        model.close();
        render(migrator.currentModel);
        updateTabForId(migrator.currentModelId);
        model = migrator.currentModel;
    });
    // If the ModelLoader doesn't know how to load the model required for migration, it emits "migrationNotSupported".
    // For example, this might be hit if another client has a newer ModelLoader and proposes a version our
    // ModelLoader doesn't know about.
    // However, this will never be hit in this demo since we have a finite set of models to support.  If the model
    // code loader pulls in the appropriate model dynamically, this might also never be hit since all clients
    // theoretically are referencing the same model library.
    migrator.on("migrationNotSupported", (version: string) => {
        // To move forward, we would need to acquire a model loader capable of loading the given model, retry the
        // load, and set up a new Migrator with the new model loader.
        console.error(`Tried to migrate to version ${version} which is not supported by the current ModelLoader`);
    });

    // This would be a good point to trigger normal upgrade logic - we're fully set up for migration, can inspect the
    // model, and haven't rendered yet.  We could even migrate multiple times if necessary (e.g. if daisy-chaining is
    // required).  E.g. something like:
    // let versionToPropose: string;
    // while (versionToPropose = await getMigrationTargetFromSomeService(model.version)) {
    //     model.proposeVersion(versionToPropose);
    //     await new Promise<void>((resolve) => {
    //         migrator.once("migrated", resolve);
    //     });
    // }
    // In this demo however, we trigger the proposal through the debug buttons.

    render(model);
    updateTabForId(id);
}

start().catch((error) => console.error(error));

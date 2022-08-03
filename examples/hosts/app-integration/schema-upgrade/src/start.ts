/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import { createTinyliciousCreateNewRequest } from "@fluidframework/tinylicious-driver";
import { demoCodeLoader, DemoModelCodeLoader } from "./demoLoaders";
import { ModelLoader } from "./modelLoading";
import { externalDataSource } from "./externalData";
import { IMigratableModel, IVersionedModel } from "./migrationInterfaces";
import { Migrator } from "./migrator";
import { InventoryListContainer as InventoryListContainer1 } from "./modelVersion1";
import { InventoryListContainer as InventoryListContainer2 } from "./modelVersion2";
import { DebugView, InventoryListContainerView } from "./view";
import { TinyliciousService } from "./tinyliciousService";

const updateTabForId = (id: string) => {
    // Update the URL with the actual ID
    location.hash = id;

    // Put the ID in the tab title
    document.title = id;
};

const isInventoryListContainer1 = (model: IVersionedModel): model is InventoryListContainer1 => {
    return model.version === "one";
};

const isInventoryListContainer2 = (model: IVersionedModel): model is InventoryListContainer2 => {
    return model.version === "two";
};

const getUrlForContainerId = (containerId: string) => `/#${containerId}`;

const render = (model: IVersionedModel) => {
    const appDiv = document.getElementById("app") as HTMLDivElement;
    ReactDOM.unmountComponentAtNode(appDiv);
    // This demo uses the same view for both versions 1 & 2 - if we wanted to use different views for different model
    // versions, we could check its version here and select the appropriate view.
    // TODO: Better view code loading.
    if (isInventoryListContainer1(model) || isInventoryListContainer2(model)) {
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

    const modelLoader = new ModelLoader<IMigratableModel>({
        urlResolver: tinyliciousService.urlResolver,
        documentServiceFactory: tinyliciousService.documentServiceFactory,
        codeLoader: demoCodeLoader,
        modelCodeLoader: new DemoModelCodeLoader(),
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

    // TODO: Could be reasonable to merge Migrator into the ModelLoader, for a MigratingModelLoader.
    // The eventing would be a little weird if the loader can load multiple models, but maybe it's OK to have one
    // loader per model?
    const migrator = new Migrator(modelLoader, model, id);
    migrator.on("migrated", () => {
        model.close();
        render(migrator.currentModel);
        updateTabForId(migrator.currentModelId);
        model = migrator.currentModel;
    });
    migrator.on("migrationNotSupported", (version: string) => {
        // TODO: Figure out what a reasonable end-user experience might be in this case.
        console.error(`Tried to migrate to version ${version} which is not supported by the current ModelLoader`);
    });

    // Could do some migration loop here -- repeat this until no further migration needed
    // const versionToPropose = await getMaximumMigratableVersionFromSomeService(model.version); // string | undefined
    // if (versionToPropose !== undefined) {
    //     model.proposeVersion(versionToPropose);
    // }

    // TODO: here I proceed to rendering without checking the migration state, but instead we could decline to render
    // if we're going to immediately load a new container.  Consider whether this would be better.
    render(model);
    updateTabForId(id);
}

start().catch((error) => console.error(error));

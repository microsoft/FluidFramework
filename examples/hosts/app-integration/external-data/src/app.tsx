/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TinyliciousService } from "@fluid-experimental/get-container";
import { Container, Loader } from "@fluidframework/container-loader";

import React, { useRef } from "react";
import ReactDOM from "react-dom";

import { InventoryListContainerRuntimeFactory } from "./containerCode";
import { exportStringData, fetchData, importStringData } from "./dataHelpers";
import { IInventoryList } from "./dataObject";
import { InventoryListView } from "./view";

// In interacting with the service, we need to be explicit about whether we're creating a new document vs. loading
// an existing one.  We also need to provide the unique ID for the document we are creating or loading from.

// In this app, we'll choose to create a new document when navigating directly to http://localhost:8080.  For the ID,
// we'll choose to use the current timestamp.  We'll also choose to interpret the URL hash as an existing document's
// ID to load from, so the URL for a document load will look something like http://localhost:8080/#1596520748752.
// These policy choices are arbitrary for demo purposes, and can be changed however you'd like.
let createNew = false;
if (location.hash.length === 0) {
    createNew = true;
    location.hash = Date.now().toString();
}
const documentId = location.hash.substring(1);
document.title = documentId;

async function getInventoryListFromContainer(container: Container): Promise<IInventoryList> {
    // Since we're using a ContainerRuntimeFactoryWithDefaultDataStore, our inventory list is available at the URL "/".
    const url = "/";
    const response = await container.request({ url });

    // Verify the response to make sure we got what we expected.
    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        throw new Error(`Unable to retrieve data object at URL: "${url}"`);
    } else if (response.value === undefined) {
        throw new Error(`Empty response from URL: "${url}"`);
    }

    return response.value as IInventoryList;
}

interface IAppViewProps {
    inventoryList: IInventoryList;
    importedStringData: string | undefined;
    getExportData: () => Promise<string>;
}

const AppView: React.FC<IAppViewProps> = (props: IAppViewProps) => {
    const { inventoryList, importedStringData, getExportData } = props;

    // eslint-disable-next-line no-null/no-null
    const exportDataRef = useRef<HTMLTextAreaElement>(null);

    const exportButtonClickHandler = () => {
        getExportData()
            .then((exportData) => {
                // eslint-disable-next-line no-null/no-null
                if (exportDataRef.current !== null) {
                    exportDataRef.current.value = exportData;
                }
            })
            .catch(console.error);
    };

    let importedDataView;
    if (importedStringData !== undefined) {
        importedDataView = (
            <div>
                <div>Imported data:</div>
                <textarea rows={ 5 } value={ importedStringData } readOnly></textarea>
            </div>
        );
    } else {
        importedDataView = <div>Loaded from existing container</div>;
    }

    return (
        <div>
            { importedDataView }
            <InventoryListView inventoryList={ inventoryList } />
            <button onClick={ exportButtonClickHandler }>Export</button>
            <div>Data out:</div>
            <textarea ref={ exportDataRef } rows={ 5 } readOnly></textarea>
        </div>
    );
};

async function start(): Promise<void> {
    const tinyliciousService = new TinyliciousService();

    const module = { fluidExport: InventoryListContainerRuntimeFactory };
    const codeLoader = { load: async () => module };

    const loader = new Loader({
        urlResolver: tinyliciousService.urlResolver,
        documentServiceFactory: tinyliciousService.documentServiceFactory,
        codeLoader,
    });

    let fetchedData: string | undefined;
    let container: Container;
    let inventoryList: IInventoryList;

    if (createNew) {
        fetchedData = await fetchData();
        container = await loader.createDetachedContainer({ package: "no-dynamic-package", config: {} });
        inventoryList = await getInventoryListFromContainer(container);
        await importStringData(inventoryList, fetchedData);
        await container.attach({ url: documentId });
    } else {
        container = await loader.resolve({ url: documentId });
        inventoryList = await getInventoryListFromContainer(container);
    }

    // Given an IInventoryList, we can render the list and provide controls for users to modify it.
    const div = document.getElementById("content") as HTMLDivElement;
    ReactDOM.render(
        <AppView
            importedStringData={ fetchedData }
            inventoryList={ inventoryList }
            // CONSIDER: it's perhaps more-correct to spawn a new client to extract with (to avoid local changes).
            // This can be done by making a loader.request() call with appropriate headers (same as we do for the
            // summarizing client).
            getExportData={ async () => exportStringData(inventoryList) }
        />,
        div,
    );
}

start().catch((error) => console.error(error));

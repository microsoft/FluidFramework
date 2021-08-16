/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useRef } from "react";

import { IInventoryList } from "./dataObject";
import { InventoryListView } from "./view";

export interface IAppViewProps {
    inventoryList: IInventoryList;
    // Normally there's no need to display the imported string data, this is for demo purposes only.
    importedStringData: string | undefined;
    // Normally this is probably a Promise<void>.  Returns a string here for demo purposes only.
    writeToExternalStorage: () => Promise<string>;
}

export const AppView: React.FC<IAppViewProps> = (props: IAppViewProps) => {
    const { inventoryList, importedStringData, writeToExternalStorage } = props;

    // eslint-disable-next-line no-null/no-null
    const savedDataRef = useRef<HTMLTextAreaElement>(null);

    const saveButtonClickHandler = () => {
        writeToExternalStorage()
            // As noted above, in a real scenario we don't need to observe the data in the view.
            // Here we display it visually for demo purposes only.
            .then((savedData) => {
                // eslint-disable-next-line no-null/no-null
                if (savedDataRef.current !== null) {
                    savedDataRef.current.value = savedData;
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
            <button onClick={ saveButtonClickHandler }>Save</button>
            <div>Data out:</div>
            <textarea ref={ savedDataRef } rows={ 5 } readOnly></textarea>
        </div>
    );
};

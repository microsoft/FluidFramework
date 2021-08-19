/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useRef, useState } from "react";

import { IContainerKillBit } from "./containerKillBit";
import { IInventoryList } from "./inventoryList";
import { InventoryListView } from "./inventoryView";

export interface IAppViewProps {
    inventoryList: IInventoryList;
    // Normally there's no need to display the imported string data, this is for demo purposes only.
    importedStringData: string | undefined;
    // Normally this is probably a Promise<void>.  Returns a string here for demo purposes only.
    writeToExternalStorage: () => Promise<string>;
    containerKillBit: IContainerKillBit;
}

export const AppView: React.FC<IAppViewProps> = (props: IAppViewProps) => {
    const { inventoryList, importedStringData, writeToExternalStorage, containerKillBit } = props;

    const [dead, setDead] = useState<boolean>(containerKillBit.dead);
    const [sessionEnding, setSessionEnding] = useState<boolean>(containerKillBit.markedForDestruction);

    useEffect(() => {
        const deadHandler = () => {
            setDead(containerKillBit.dead);
        };
        containerKillBit.on("dead", deadHandler);
        return () => {
            containerKillBit.off("dead", deadHandler);
        };
    }, [containerKillBit]);

    useEffect(() => {
        const markedForDestructionHandler = () => {
            setSessionEnding(containerKillBit.markedForDestruction);
        };
        containerKillBit.on("markedForDestruction", markedForDestructionHandler);
        return () => {
            containerKillBit.off("markedForDestruction", markedForDestructionHandler);
        };
    }, [containerKillBit]);

    // eslint-disable-next-line no-null/no-null
    const savedDataRef = useRef<HTMLTextAreaElement>(null);

    if (dead) {
        return <h1>The session has ended.</h1>;
    }

    const endSessionButtonClickHandler = () => {
        containerKillBit.markForDestruction();
    };

    const setDeadButtonClickHandler = () => {
        containerKillBit.setDead();
    };

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
            { sessionEnding && <h1>The session is ending...</h1> }
            { importedDataView }
            <InventoryListView inventoryList={ inventoryList } disabled={ sessionEnding } />
            <button onClick={ endSessionButtonClickHandler }>End collaboration session</button>
            <button onClick={ setDeadButtonClickHandler }>Set dead</button>
            <button onClick={ saveButtonClickHandler }>Save</button>
            <div>Data out:</div>
            <textarea ref={ savedDataRef } rows={ 5 } readOnly></textarea>
        </div>
    );
};

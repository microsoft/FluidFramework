/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useRef, useState } from "react";

import type { IContainerKillBit, IInventoryList } from "./interfaces";
import { InventoryListView } from "./inventoryView";

export interface IAppViewProps {
    inventoryList: IInventoryList;
    // Normally there's no need to display the imported string data, this is for demo purposes only.
    importedStringData: string | undefined;
    // Normally this is probably a Promise<void>.  Returns a string here for demo purposes only.
    writeToExternalStorage: () => Promise<string>;
    saveAndEndSession: () => Promise<void>;
    containerKillBit: IContainerKillBit;
}

export const AppView: React.FC<IAppViewProps> = (props: IAppViewProps) => {
    const {
        inventoryList,
        importedStringData,
        writeToExternalStorage,
        containerKillBit,
        saveAndEndSession,
    } = props;

    const [dead, setDead] = useState<boolean>(containerKillBit.dead);
    const [sessionEnding, setSessionEnding] = useState<boolean>(containerKillBit.markedForDestruction);

    useEffect(() => {
        const deadHandler = () => {
            setDead(containerKillBit.dead);
        };
        containerKillBit.on("dead", deadHandler);
        // For some reason, I'm seeing the event fire between setting the state initially and adding the listener.
        deadHandler();
        return () => {
            containerKillBit.off("dead", deadHandler);
        };
    }, [containerKillBit]);

    useEffect(() => {
        const markedForDestructionHandler = () => {
            setSessionEnding(containerKillBit.markedForDestruction);
        };
        containerKillBit.on("markedForDestruction", markedForDestructionHandler);
        markedForDestructionHandler();
        return () => {
            containerKillBit.off("markedForDestruction", markedForDestructionHandler);
        };
    }, [containerKillBit]);

    const savedDataRef = useRef<HTMLTextAreaElement>(null);

    if (dead) {
        return <h1>The session has ended.</h1>;
    }

    const endSessionButtonClickHandler = () => {
        containerKillBit.markForDestruction().catch(console.error);
    };

    const setDeadButtonClickHandler = () => {
        containerKillBit.setDead().catch(console.error);
    };

    const saveButtonClickHandler = () => {
        writeToExternalStorage()
            // As noted above, in a real scenario we don't need to observe the data in the view.
            // Here we display it visually for demo purposes only.
            .then((savedData) => {
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
            <button onClick={ saveAndEndSession }>Save and End Session</button><br />
            <button onClick={ endSessionButtonClickHandler }>1. End collaboration session</button>
            <button onClick={ saveButtonClickHandler }>2. Save</button>
            <button onClick={ setDeadButtonClickHandler }>3. Set dead</button>
            <div>Data out:</div>
            <textarea ref={ savedDataRef } rows={ 5 } readOnly></textarea>
        </div>
    );
};

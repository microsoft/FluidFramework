/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useRef, useState } from "react";

import type { ExternalDataSource } from "./externalData";
import type { IContainerKillBit, IInventoryList } from "./interfaces";
import { InventoryListView } from "./inventoryView";

interface IDebugViewProps {
    containerKillBit: IContainerKillBit;
    // Normally there's no need to display the imported string data, this is for demo purposes only.
    importedStringData: string | undefined;
    proposeEndSession: () => void;
    writeToExternalStorage: () => void;
    endSession: () => void;
    saveAndEndSession: () => void;
    // End the collaboration session and create a new container using exported data.
    migrateContainer: () => void;
    externalDataSource: ExternalDataSource;
}

const DebugView: React.FC<IDebugViewProps> = (props: IDebugViewProps) => {
    const {
        containerKillBit,
        importedStringData,
        proposeEndSession,
        writeToExternalStorage,
        endSession,
        saveAndEndSession,
        migrateContainer,
        externalDataSource,
    } = props;

    return (
        <div>
            <SessionStatusView containerKillBit={ containerKillBit } />
            <ImportedDataView data={ importedStringData } />
            <ControlsView
                saveAndEndSession={ saveAndEndSession }
                migrateContainer={ migrateContainer }
                proposeEndSession={ proposeEndSession }
                writeToExternalStorage={ writeToExternalStorage }
                endSession={ endSession }
            />
            <ExternalDataSourceView externalDataSource={ externalDataSource }/>
        </div>
    );
};

interface ISessionStatusViewProps {
    containerKillBit: IContainerKillBit;
}

const SessionStatusView: React.FC<ISessionStatusViewProps> = (props: ISessionStatusViewProps) => {
    const { containerKillBit } = props;

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

    return (
        <>
            { sessionEnding && !dead && <h1>The session is ending...</h1> }
            { dead && <h1>The session has ended.</h1> }
        </>
    );
};

interface IImportedDataViewProps {
    data: string | undefined;
}

const ImportedDataView: React.FC<IImportedDataViewProps> = (props: IImportedDataViewProps) => {
    const { data } = props;
    if (data === undefined) {
        return <div>Loaded from existing container</div>;
    }

    return (
        <div>
            <div>Imported data:</div>
            <textarea rows={ 5 } value={ data } readOnly></textarea>
        </div>
    );
};

interface IControlsViewProps {
    proposeEndSession: () => void;
    writeToExternalStorage: () => void;
    endSession: () => void;
    saveAndEndSession: () => void;
    // End the collaboration session and create a new container using exported data.
    migrateContainer: () => void;
}

const ControlsView: React.FC<IControlsViewProps> = (props: IControlsViewProps) => {
    const {
        proposeEndSession,
        writeToExternalStorage,
        endSession,
        saveAndEndSession,
        migrateContainer,
    } = props;

    return (
        <div>
            <button onClick={ saveAndEndSession }>Save and End Session</button>
            <br />
            <button onClick={ migrateContainer }>Migrate to new container</button>
            <br />
            <button onClick={ proposeEndSession }>1. Propose ending collaboration session</button>
            <button onClick={ writeToExternalStorage }>2. Write out to external data source</button>
            <button onClick={ endSession }>3. Actually end the collaboration session</button>
        </div>
    );
};

interface IExternalDataSourceViewProps {
    externalDataSource: ExternalDataSource;
}

const ExternalDataSourceView: React.FC<IExternalDataSourceViewProps> = (props: IExternalDataSourceViewProps) => {
    const { externalDataSource } = props;
    const externalDataTextareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const onDataWritten = (data: string) => {
            if (externalDataTextareaRef.current !== null) {
                externalDataTextareaRef.current.value = data;
            }
            console.log("Wrote data:");
            console.log(data);
        };
        externalDataSource.on("dataWritten", onDataWritten);
        return () => {
            externalDataSource.off("dataWritten", onDataWritten);
        };
    }, [externalDataSource]);

    return (
        <div>
            <div>External data source:</div>
            <textarea ref={ externalDataTextareaRef } rows={ 5 } readOnly></textarea>
        </div>
    );
};

export interface IAppViewProps {
    inventoryList: IInventoryList;
    containerKillBit: IContainerKillBit;
    // Normally there's no need to display the imported string data, this is for demo purposes only.
    importedStringData: string | undefined;
    proposeEndSession: () => void;
    writeToExternalStorage: () => void;
    endSession: () => void;
    saveAndEndSession: () => void;
    // End the collaboration session and create a new container using exported data.
    migrateContainer: () => void;
    externalDataSource: ExternalDataSource;
}

export const AppView: React.FC<IAppViewProps> = (props: IAppViewProps) => {
    const {
        inventoryList,
        containerKillBit,
        importedStringData,
        proposeEndSession,
        writeToExternalStorage,
        endSession,
        saveAndEndSession,
        migrateContainer,
        externalDataSource,
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

    const disabled = sessionEnding || dead;

    return (
        <div>
            <InventoryListView inventoryList={ inventoryList } disabled={ disabled } />
            <DebugView
                containerKillBit={ containerKillBit }
                importedStringData={ importedStringData }
                saveAndEndSession={ saveAndEndSession }
                migrateContainer={ migrateContainer }
                proposeEndSession={ proposeEndSession }
                writeToExternalStorage={ writeToExternalStorage }
                endSession={ endSession }
                externalDataSource={ externalDataSource }
            />
        </div>
    );
};

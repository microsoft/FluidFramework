/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useRef, useState } from "react";
import { App, SessionState } from "./app";

import type { ExternalDataSource } from "./externalData";
import { InventoryListView } from "./inventoryView";

interface IDebugViewProps {
    app: App;
    // Normally there's no need to display the imported string data, this is for demo purposes only.
    importedStringData: string | undefined;
    // End the collaboration session and create a new container using exported data.
    migrateContainer: () => void;
    externalDataSource: ExternalDataSource;
}

const DebugView: React.FC<IDebugViewProps> = (props: IDebugViewProps) => {
    const {
        app,
        importedStringData,
        migrateContainer,
        externalDataSource,
    } = props;

    return (
        <div>
            <SessionStatusView app={ app } />
            <ImportedDataView data={ importedStringData } />
            <ControlsView
                saveAndEndSession={ app.saveAndEndSession }
                migrateContainer={ migrateContainer }
                proposeEndSession={ app.proposeEndSession }
                writeToExternalStorage={ app.writeToExternalStorage }
                endSession={ app.endSession }
            />
            <ExternalDataSourceView externalDataSource={ externalDataSource }/>
        </div>
    );
};

interface ISessionStatusViewProps {
    app: App;
}

const SessionStatusView: React.FC<ISessionStatusViewProps> = (props: ISessionStatusViewProps) => {
    const { app } = props;

    const [sessionState, setSessionState] = useState<SessionState>(app.sessionState);

    useEffect(() => {
        const sessionStateChangedHandler = () => {
            setSessionState(app.sessionState);
        };
        app.on("sessionStateChanged", sessionStateChangedHandler);
        sessionStateChangedHandler();
        return () => {
            app.off("sessionStateChanged", sessionStateChangedHandler);
        };
    }, [app]);

    return (
        <>
            { sessionState === SessionState.ending && <h1>The session is ending...</h1> }
            { sessionState === SessionState.ended && <h1>The session has ended.</h1> }
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
    app: App;
    // Normally there's no need to display the imported string data, this is for demo purposes only.
    importedStringData: string | undefined;
    // End the collaboration session and create a new container using exported data.
    migrateContainer: () => void;
    externalDataSource: ExternalDataSource;
}

export const AppView: React.FC<IAppViewProps> = (props: IAppViewProps) => {
    const {
        app,
        importedStringData,
        migrateContainer,
        externalDataSource,
    } = props;

    const [disableInput, setDisableInput] = useState<boolean>(app.sessionState !== SessionState.collaborating);

    useEffect(() => {
        const sessionStateChangedHandler = () => {
            setDisableInput(app.sessionState !== SessionState.collaborating);
        };
        app.on("sessionStateChanged", sessionStateChangedHandler);
        sessionStateChangedHandler();
        return () => {
            app.off("sessionStateChanged", sessionStateChangedHandler);
        };
    }, [app]);

    return (
        <div>
            <InventoryListView inventoryList={ app.inventoryList } disabled={ disableInput } />
            <DebugView
                app={ app }
                importedStringData={ importedStringData }
                migrateContainer={ migrateContainer }
                externalDataSource={ externalDataSource }
            />
        </div>
    );
};

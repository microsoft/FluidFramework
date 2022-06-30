/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidCodeDetails } from "@fluidframework/container-definitions";

import React, { useEffect, useRef, useState } from "react";

import { App, SessionState } from "./app";
import type { ExternalDataSource } from "./externalData";
import { InventoryListView } from "./inventoryView";

export interface IDebugViewProps {
    app: App;
    externalDataSource: ExternalDataSource;
}

export const DebugView: React.FC<IDebugViewProps> = (props: IDebugViewProps) => {
    const {
        app,
        externalDataSource,
    } = props;

    return (
        <div>
            <SessionStatusView app={ app } />
            <ImportedDataView data={ undefined } />
            <ControlsView proposeCodeDetails={ app.proposeCodeDetails } />
            <ExternalDataSourceView externalDataSource={ externalDataSource }/>
        </div>
    );
};

interface ISessionStatusViewProps {
    app: App;
}

const SessionStatusView: React.FC<ISessionStatusViewProps> = (props: ISessionStatusViewProps) => {
    const { app } = props;

    const [sessionState, setSessionState] = useState<SessionState>(app.getSessionState());

    useEffect(() => {
        const sessionStateChangedHandler = () => {
            setSessionState(app.getSessionState());
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
    proposeCodeDetails: (codeDetails: IFluidCodeDetails) => void;
}

const ControlsView: React.FC<IControlsViewProps> = (props: IControlsViewProps) => {
    const {
        proposeCodeDetails,
    } = props;

    return (
        <div>
            <button onClick={ () => { proposeCodeDetails({ package: "two" }); } }>
                Propose code upgrade
            </button>
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
}

export const AppView: React.FC<IAppViewProps> = (props: IAppViewProps) => {
    const { app } = props;

    const [disableInput, setDisableInput] = useState<boolean>(app.getSessionState() !== SessionState.collaborating);

    useEffect(() => {
        const sessionStateChangedHandler = () => {
            setDisableInput(app.getSessionState() !== SessionState.collaborating);
        };
        app.on("sessionStateChanged", sessionStateChangedHandler);
        sessionStateChangedHandler();
        return () => {
            app.off("sessionStateChanged", sessionStateChangedHandler);
        };
    }, [app]);

    return (
        <InventoryListView inventoryList={ app.inventoryList } disabled={ disableInput } />
    );
};

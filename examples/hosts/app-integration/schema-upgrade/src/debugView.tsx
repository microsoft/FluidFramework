/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidCodeDetails } from "@fluidframework/container-definitions";

import React, { useEffect, useRef, useState } from "react";

import type { ExternalDataSource } from "./externalData";
import { IMigratable, MigrationState } from "./interfaces";

export interface IDebugViewProps {
    app: IMigratable;
    externalDataSource: ExternalDataSource;
}

export const DebugView: React.FC<IDebugViewProps> = (props: IDebugViewProps) => {
    const {
        app,
        externalDataSource,
    } = props;

    return (
        <div>
            <MigrationStatusView app={ app } />
            <ImportedDataView data={ undefined } />
            <ControlsView proposeCodeDetails={ app.proposeCodeDetails } />
            <ExternalDataSourceView externalDataSource={ externalDataSource }/>
        </div>
    );
};

interface IMigrationStatusViewProps {
    app: IMigratable;
}

const MigrationStatusView: React.FC<IMigrationStatusViewProps> = (props: IMigrationStatusViewProps) => {
    const { app } = props;

    const [migrationState, setMigrationState] = useState<MigrationState>(app.getMigrationState());

    useEffect(() => {
        const migrationStateChangedHandler = () => {
            setMigrationState(app.getMigrationState());
        };
        app.on("migrationStateChanged", migrationStateChangedHandler);
        migrationStateChangedHandler();
        return () => {
            app.off("migrationStateChanged", migrationStateChangedHandler);
        };
    }, [app]);

    return (
        <>
            { migrationState === MigrationState.migrating && <h1>Migration in progress...</h1> }
            { migrationState === MigrationState.ended && <h1>This app has been migrated.</h1> }
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

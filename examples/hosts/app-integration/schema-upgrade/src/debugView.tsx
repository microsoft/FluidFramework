/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useRef, useState } from "react";

import type { ExternalDataSource } from "./externalData";
import { IMigratable, MigrationState } from "./interfaces";

export interface IDebugViewProps {
    model: IMigratable;
    externalDataSource: ExternalDataSource;
}

export const DebugView: React.FC<IDebugViewProps> = (props: IDebugViewProps) => {
    const {
        model,
        externalDataSource,
    } = props;

    return (
        <div>
            <MigrationStatusView model={ model } />
            <ImportedDataView data={ undefined } />
            <ControlsView proposeVersion={ model.proposeVersion } />
            <ExternalDataSourceView externalDataSource={ externalDataSource }/>
        </div>
    );
};

interface IMigrationStatusViewProps {
    model: IMigratable;
}

const MigrationStatusView: React.FC<IMigrationStatusViewProps> = (props: IMigrationStatusViewProps) => {
    const { model } = props;

    const [migrationState, setMigrationState] = useState<MigrationState>(model.getMigrationState());

    useEffect(() => {
        const migrationStateChangedHandler = () => {
            setMigrationState(model.getMigrationState());
        };
        model.on("migrating", migrationStateChangedHandler);
        model.on("migrated", migrationStateChangedHandler);
        migrationStateChangedHandler();
        return () => {
            model.off("migrating", migrationStateChangedHandler);
            model.off("migrated", migrationStateChangedHandler);
        };
    }, [model]);

    return (
        <>
            { migrationState === MigrationState.migrating && <h1>Migration in progress...</h1> }
            { migrationState === MigrationState.migrated && <h1>This app has been migrated.</h1> }
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
    proposeVersion: (version: string) => void;
}

const ControlsView: React.FC<IControlsViewProps> = (props: IControlsViewProps) => {
    const {
        proposeVersion,
    } = props;

    return (
        <div>
            <button onClick={ () => { proposeVersion("one"); } }>
                Propose code version one
            </button>
            <button onClick={ () => { proposeVersion("two"); } }>
                Propose code version two
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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";

import { IMigratable, MigrationState } from "../interfaces";

export interface IDebugViewProps {
    model: IMigratable;
}

export const DebugView: React.FC<IDebugViewProps> = (props: IDebugViewProps) => {
    const {
        model,
    } = props;

    return (
        <div>
            <MigrationStatusView model={ model } />
            <ControlsView proposeVersion={ model.proposeVersion } />
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
            <div>
                Using model: { model.version }
            </div>
            <div>
                Status:
                { migrationState === MigrationState.collaborating && " Normal collaboration" }
                { migrationState === MigrationState.migrating && " Migration in progress" }
                { migrationState === MigrationState.migrated && " Migration complete" }
            </div>
            <div>
                {
                    model.acceptedVersion === undefined
                        ? "No migration proposed yet"
                        : `Proposed version to migrate to: ${model.acceptedVersion}`
                }
            </div>
            <div>
                {
                    model.newContainerId === undefined
                        ? "No migrated container yet"
                        : `Migrated to new container at ${model.newContainerId}`
                }
            </div>
        </>
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

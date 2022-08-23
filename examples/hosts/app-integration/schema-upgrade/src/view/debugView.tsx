/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";

import { IMigratableModel, MigrationState } from "../migrationInterfaces";

export interface IDebugViewProps {
    model: IMigratableModel;
    getUrlForContainerId?: (containerId: string) => string;
}

export const DebugView: React.FC<IDebugViewProps> = (props: IDebugViewProps) => {
    const {
        model,
        getUrlForContainerId,
    } = props;

    return (
        <div>
            <h2 style={{ textDecoration: "underline" }}>Debug info</h2>
            <MigrationStatusView model={ model } getUrlForContainerId={ getUrlForContainerId } />
            <ControlsView proposeVersion={ model.proposeVersion } />
        </div>
    );
};

interface IMigrationStatusViewProps {
    model: IMigratableModel;
    getUrlForContainerId?: (containerId: string) => string;
}

const MigrationStatusView: React.FC<IMigrationStatusViewProps> = (props: IMigrationStatusViewProps) => {
    const {
        model,
        getUrlForContainerId,
    } = props;

    const [migrationState, setMigrationState] = useState<MigrationState>(model.getMigrationState());

    useEffect(() => {
        const migrationStateChangedHandler = () => {
            setMigrationState(model.getMigrationState());
        };
        model.on("stopping", migrationStateChangedHandler);
        model.on("migrating", migrationStateChangedHandler);
        model.on("migrated", migrationStateChangedHandler);
        migrationStateChangedHandler();
        return () => {
            model.off("stopping", migrationStateChangedHandler);
            model.off("migrating", migrationStateChangedHandler);
            model.off("migrated", migrationStateChangedHandler);
        };
    }, [model]);

    const proposedVersionStatus = model.proposedVersion === undefined
        ? "No proposed version for migration yet"
        : `Proposed version to migrate to: ${model.proposedVersion}`;

    const acceptedVersionStatus = model.acceptedVersion === undefined
        ? "No accepted version for migration yet"
        : `Accepted version to migrate to: ${model.acceptedVersion}`;

    const migratedContainerStatus = (() => {
        if (model.newContainerId === undefined) {
            return "No migrated container yet";
        }

        const navToNewContainer = () => {
            if (model.newContainerId !== undefined && getUrlForContainerId !== undefined) {
                location.href = getUrlForContainerId(model.newContainerId);
                location.reload();
            }
        };

        // If we're able to get a direct link to the migrated container, do so.
        // Otherwise just use the string representation of the container id.
        const migratedReference = getUrlForContainerId === undefined
            ? model.newContainerId
            : (
                <a href={ getUrlForContainerId(model.newContainerId) } onClick={ navToNewContainer }>
                    { model.newContainerId }
                </a>
            );

        return <>Migrated to new container at { migratedReference }</>;
    })();

    return (
        <div style={{ margin: "10px 0" }}>
            <div>
                Using model: { model.version }
            </div>
            <div>
                Status:
                { migrationState === MigrationState.collaborating && " Normal collaboration" }
                { migrationState === MigrationState.stopping && " Migration proposed" }
                { migrationState === MigrationState.migrating && " Migration in progress" }
                { migrationState === MigrationState.migrated && " Migration complete" }
            </div>
            <div>{ proposedVersionStatus }</div>
            <div>{ acceptedVersionStatus }</div>
            <div>{ migratedContainerStatus }</div>
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
        <div style={{ margin: "10px 0" }}>
            Propose version:<br />
            <button onClick={ () => { proposeVersion("one"); } }>
                "one"
            </button>
            <button onClick={ () => { proposeVersion("two"); } }>
                "two"
            </button>
        </div>
    );
};

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";

import type { IMigratableModel, MigrationState } from "../migrationInterfaces";

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
            <ControlsView proposeVersion={ model.migrationTool.proposeVersion } />
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

    const [migrationState, setMigrationState] = useState<MigrationState>(model.migrationTool.migrationState);

    useEffect(() => {
        const migrationStateChangedHandler = () => {
            setMigrationState(model.migrationTool.migrationState);
        };
        model.migrationTool.on("stopping", migrationStateChangedHandler);
        model.migrationTool.on("migrating", migrationStateChangedHandler);
        model.migrationTool.on("migrated", migrationStateChangedHandler);
        migrationStateChangedHandler();
        return () => {
            model.migrationTool.off("stopping", migrationStateChangedHandler);
            model.migrationTool.off("migrating", migrationStateChangedHandler);
            model.migrationTool.off("migrated", migrationStateChangedHandler);
        };
    }, [model]);

    const proposedVersionStatus = model.migrationTool.proposedVersion === undefined
        ? "No proposed version for migration yet"
        : `Proposed version to migrate to: ${model.migrationTool.proposedVersion}`;

    const acceptedVersionStatus = model.migrationTool.acceptedVersion === undefined
        ? "No accepted version for migration yet"
        : `Accepted version to migrate to: ${model.migrationTool.acceptedVersion}`;

    const migratedContainerStatus = (() => {
        if (model.migrationTool.newContainerId === undefined) {
            return "No migrated container yet";
        }

        const navToNewContainer = () => {
            if (model.migrationTool.newContainerId !== undefined && getUrlForContainerId !== undefined) {
                location.href = getUrlForContainerId(model.migrationTool.newContainerId);
                location.reload();
            }
        };

        // If we're able to get a direct link to the migrated container, do so.
        // Otherwise just use the string representation of the container id.
        const migratedReference = getUrlForContainerId === undefined
            ? model.migrationTool.newContainerId
            : (
                <a href={ getUrlForContainerId(model.migrationTool.newContainerId) } onClick={ navToNewContainer }>
                    { model.migrationTool.newContainerId }
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
                { migrationState === "collaborating" && " Normal collaboration" }
                { migrationState === "stopping" && " Migration proposed" }
                { migrationState === "migrating" && " Migration in progress" }
                { migrationState === "migrated" && " Migration complete" }
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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { externalDataSource } from "../externalData";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IDebugViewProps {
}

export const DebugView: React.FC<IDebugViewProps> = (props: IDebugViewProps) => {
    return (
        <div>
            <h2 style={{ textDecoration: "underline" }}>Debug info</h2>
            <MigrationStatusView />
            <ControlsView />
        </div>
    );
};

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IMigrationStatusViewProps {
}

const MigrationStatusView: React.FC<IMigrationStatusViewProps> = (props: IMigrationStatusViewProps) => {
    return (
        <div style={{ margin: "10px 0" }}>
            Status eventually
        </div>
    );
};

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IControlsViewProps {
}

const ControlsView: React.FC<IControlsViewProps> = (props: IControlsViewProps) => {
    return (
        <div style={{ margin: "10px 0" }}>
            <button onClick={ externalDataSource.debugResetData }>Reset external data</button>
            More controls eventually
        </div>
    );
};

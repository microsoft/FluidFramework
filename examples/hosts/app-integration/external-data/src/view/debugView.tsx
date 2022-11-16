/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";
import { externalDataSource, parseStringData } from "../externalData";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IDebugViewProps {
}

export const DebugView: React.FC<IDebugViewProps> = (props: IDebugViewProps) => {
    return (
        <div>
            <h2 style={{ textDecoration: "underline" }}>Debug info</h2>
            <ExternalDataView />
            <SyncStatusView />
            <ControlsView />
        </div>
    );
};

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IExternalDataViewProps {
}

const ExternalDataView: React.FC<IExternalDataViewProps> = (props: IExternalDataViewProps) => {
    const [externalData, setExternalData] = useState<string | undefined>();
    useEffect(() => {
        const fetchExternalData = () => {
            externalDataSource.fetchData()
                .then(setExternalData)
                .catch(console.error);
        };
        externalDataSource.on("debugDataWritten", fetchExternalData);
        fetchExternalData();
        return () => {
            externalDataSource.off("debugDataWritten", fetchExternalData);
        };
    }, []);

    const parsedExternalData = externalData === undefined
        ? []
        : parseStringData(externalData);
    console.log(parsedExternalData);
    const taskRows = parsedExternalData.map(({ id, name, priority }) => (
        <tr key={ id }>
            <td>{ id }</td>
            <td>{ name }</td>
            <td>{ priority }</td>
        </tr>
    ));

    return (
        <div>
            <h3>External Data:</h3>
            <div style={{ margin: "10px 0" }}>
                <table>
                    <thead>
                        <tr>
                            <td>ID</td>
                            <td>Title</td>
                            <td>Priority</td>
                        </tr>
                    </thead>
                    <tbody>
                        { taskRows }
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ISyncStatusViewProps {
}

// TODO: Implement the statuses below
const SyncStatusView: React.FC<ISyncStatusViewProps> = (props: ISyncStatusViewProps) => {
    return (
        <div>
            <h3>Sync status</h3>
            <div style={{ margin: "10px 0" }}>
                Fluid has [no] unsync'd changes (not implemented)<br />
                External data source has [no] unsync'd changes (not implemented)<br />
                Current sync activity: [idle | fetching | writing | resolving conflicts?] (not implemented)<br />
            </div>
        </div>
    );
};

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IControlsViewProps {
}

// TODO: Implement simulation of an external data change.  Maybe include UI for the debug user to edit the data
// themselves (as if they were editing it outside of Fluid).
// TODO: Consider how we might simulate errors/failures here to play with retry and recovery.
const ControlsView: React.FC<IControlsViewProps> = (props: IControlsViewProps) => {
    return (
        <div>
            <h3>Debug controls</h3>
            <div style={{ margin: "10px 0" }}>
                <button onClick={ externalDataSource.debugResetData }>Reset external data</button><br />
                <button>Simulate external data change (not implemented)</button><br />
            </div>
        </div>
    );
};

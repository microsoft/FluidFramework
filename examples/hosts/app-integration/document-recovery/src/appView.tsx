/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";
import { Alert, Button, Stack } from "react-bootstrap";
import { DataController } from "./dataController";
import { RecoveryAgent, RecoveryInfo } from "./recoveryAgent";

export interface IAppViewProps {
    updateCounter: () => Promise<void>;
    recoverContainer: () => Promise<void>;
    dataController: DataController;
    recoveryAgent?: RecoveryAgent;
}

export const AppView: React.FC<IAppViewProps> = (props: IAppViewProps) => {
    const {
        updateCounter,
        recoverContainer,
        dataController,
        recoveryAgent,
    } = props;

    const [data, setData] = useState<number>(dataController.value);

    const [recoveryInfo, setRecoveryInfo] = useState<RecoveryInfo | undefined>(
        recoveryAgent?.getRecoveryInfo,
    );

    useEffect(() => {
        const dataHandler = () => {
            setData(dataController.value);
        };
        dataController.on("dataChanged", dataHandler);
        return () => {
            dataController.off("dataChanged", dataHandler);
        };
    }, [dataController]);

    useEffect(() => {
        if (!recoveryAgent) {
            return;
        }

        const statusChange = () => {
            setRecoveryInfo(recoveryAgent.getRecoveryInfo);
        };

        recoveryAgent.on("recoveryInfoChanged", statusChange);
        return () => {
            recoveryAgent.off("recoveryInfoChanged", statusChange);
        };
    }, [recoveryAgent]);

    const showAlert =
        recoveryInfo?.isContainerRecovered;
    const alertVariant = recoveryInfo?.isContainerRecovered === true
        ? "success"
        : "danger";
    const alertMsg = recoveryInfo?.isContainerRecovered === true
        ? "Document was recovered."
        : "Document was corrupted.";
    const newDocLink =
        `http://localhost:8080/#${recoveryInfo?.recoveredContainerId}`;

    return (
        <div className="col-md-12 text-center">
            {showAlert === true ? (
                <Alert variant={alertVariant} className="pe-auto">
                    {alertMsg}
                </Alert>
            ) : (
                <div style={{ marginBottom: 40 }} />
            )}

            <Stack gap={5}>
                <div className="m-5">
                    <h5>My Counter:</h5>
                    <div style={{ marginBottom: 10, fontSize: 40 }}>{data}</div>

                    <Button
                        className="btn btn-secondary"
                        onClick={updateCounter}
                    >
                        Increment Counter
                    </Button>
                </div>

                <div
                    className="col-md-6 center"
                    style={{ margin: "auto", marginTop: 48 }}
                >
                    <h5 style={{ marginBottom: 24 }}> Original Container </h5>
                    <table className="table table table-striped">
                        <thead></thead>
                        <tbody>
                            <tr>
                                <th scope="row">1</th>
                                <td>Id</td>
                                <td>{recoveryInfo?.originalContainerId}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div>
                        <Button
                            className="btn btn-primary"
                            onClick={recoverContainer}
                            disabled={recoveryInfo?.recoveryStatus !== "NotStarted"}
                        >
                            Kick Off Recovery
                        </Button>
                    </div>
                </div>

                <div
                    className="col-md-6 center"
                    style={{ margin: "auto", marginTop: 48 }}
                >
                    <h5 style={{ marginBottom: 24 }}> Recovered Container </h5>
                    <table className="table table table-striped">
                        <thead></thead>
                        <tbody>
                            <tr>
                                <th scope="row">1</th>
                                <td>Id</td>
                                <td>{recoveryInfo?.recoveredContainerId}</td>
                            </tr>
                            <tr>
                                <th scope="row">2</th>
                                <td>Recovery Status</td>
                                <td>{recoveryInfo?.recoveryStatus}</td>
                            </tr>
                            <tr>
                                <th scope="row">3</th>
                                <td>Recovery Log</td>
                                <td>{recoveryInfo?.recoveryLog}</td>
                            </tr>
                        </tbody>
                    </table>
                    {recoveryInfo?.recoveredContainerId !== undefined ? (
                        <a href={newDocLink} target="_blank">
                            View Recovered Container
                        </a>
                    ) : null}
                </div>
            </Stack>
        </div>
    );
};

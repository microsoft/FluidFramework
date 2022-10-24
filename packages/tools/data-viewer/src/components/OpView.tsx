/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Stack } from "@fluentui/react";
import React from "react";
import ReactJson from "react-json-view";

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

import { Accordion } from "./Accordion";

// TODOs:
// - Copy raw data to clipboard button (outside of json viewer)
// - Raw data as modal dialogue rather than drop-down

/**
 * {@link OpView} input props.
 */
export interface OpViewProps {
    /**
     * The op (message) to render.
     */
    message: ISequencedDocumentMessage;

    /**
     * The client ID for the session.
     */
    clientId: string | undefined;
}

/**
 * Simple view for a single op (message).
 */
export function OpView(props: OpViewProps): React.ReactElement {
    const { message, clientId } = props;

    const opTimeStamp = new Date(message.timestamp);
    const nowTimeStamp = new Date();

    const wasOpToday = nowTimeStamp.getDate() === opTimeStamp.getDate();
    const doesOpBelongToMe = message.clientId === clientId;

    const header = (
        <Stack>
            <div>
                <b>Op #{message.sequenceNumber}</b>:{" "}
                {wasOpToday ? opTimeStamp.toTimeString() : opTimeStamp.toDateString()}
            </div>
        </Stack>
    );

    let dataView: React.ReactElement = <></>;
    if (message.data !== undefined) {
        /* eslint-disable @typescript-eslint/no-unsafe-assignment */
        const json = JSON.parse(message.data);
        dataView = (
            <Accordion header={<b>Raw Data</b>}>
                <ReactJson src={json} />
            </Accordion>
        );
        /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    }

    const headerBackgroundColor = !message.clientId
        ? "lightyellow"
        : doesOpBelongToMe
        ? "lightgreen"
        : "lightblue";

    return (
        <Accordion
            header={header}
            headerStyles={{
                root: {
                    backgroundColor: headerBackgroundColor,
                },
            }}
        >
            <Stack>
                <div>
                    <b>Date: </b>
                    {opTimeStamp.toDateString()}
                </div>
                <div>
                    <b>Time: </b>
                    {opTimeStamp.toTimeString()}
                </div>
                <div>
                    <b>Client: </b>
                    {`${message.clientId}${doesOpBelongToMe ? " (me)" : ""}`}
                </div>
                <div>
                    <b>Type: </b>
                    {message.type}
                </div>
                <div>
                    <b>Client sequence number: </b>
                    {message.clientSequenceNumber}
                </div>
                <div>
                    <b>Reference sequence number: </b>
                    {message.referenceSequenceNumber}
                </div>
                {dataView}
                <div>
                    <b>TODO: what else?</b>
                </div>
            </Stack>
        </Accordion>
    );
}

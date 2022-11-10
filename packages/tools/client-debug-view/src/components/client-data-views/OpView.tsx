/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Icon, Stack, StackItem } from "@fluentui/react";
import React from "react";
import ReactJson from "react-json-view";

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

import { Accordion } from "../utility-components";

// TODOs:
// - Copy raw data to clipboard button (outside of json viewer)
// - Raw data as modal dialogue rather than drop-down

/**
 * Input props describing a Fluid
 * {@link @fluidframework/protocol-definitions#ISequencedDocumentMessage | operation (op)}.
 */
export interface OpViewProps {
    /**
     * The time-stamped operation (op) log entry to render.
     */
    op: ISequencedDocumentMessage;

    /**
     * The client ID for the session, if the Container is connected.
     */
    myClientId: string | undefined;
}

/**
 * Simple view for a single op (message).
 */
export function OpView(props: OpViewProps): React.ReactElement {
    const { op, myClientId: clientId } = props;

    const opTimeStamp = new Date(op.timestamp);
    const nowTimeStamp = new Date();

    const wasOpToday = nowTimeStamp.getDate() === opTimeStamp.getDate();
    const doesOpBelongToMe = op.clientId === clientId;

    const header = (
        <Stack horizontal tokens={{ childrenGap: 5 }}>
            <StackItem>
                <b>Op #{op.sequenceNumber}</b>:{" "}
                {wasOpToday ? opTimeStamp.toTimeString() : opTimeStamp.toDateString()}
            </StackItem>
            <StackItem>
                <Icon iconName={doesOpBelongToMe ? "Upload" : "Download"} />
            </StackItem>
        </Stack>
    );

    let dataView: React.ReactElement = <></>;
    if (op.data !== undefined) {
        /* eslint-disable @typescript-eslint/no-unsafe-assignment */
        const json = JSON.parse(op.data);
        dataView = (
            <Accordion header={<b>Raw Data</b>}>
                <ReactJson src={json} />
            </Accordion>
        );
        /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    }

    const headerBackgroundColor = doesOpBelongToMe ? "lightblue" : "lightyellow";

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
                <StackItem>
                    <b>Date: </b>
                    {opTimeStamp.toDateString()}
                </StackItem>
                <StackItem>
                    <b>Time: </b>
                    {opTimeStamp.toTimeString()}
                </StackItem>
                <StackItem>
                    <b>Client: </b>
                    {`${op.clientId}${doesOpBelongToMe ? " (me)" : ""}`}
                </StackItem>
                <StackItem>
                    <b>Type: </b>
                    {op.type}
                </StackItem>
                <StackItem>
                    <b>Client sequence number: </b>
                    {op.clientSequenceNumber}
                </StackItem>
                <StackItem>
                    <b>Reference sequence number: </b>
                    {op.referenceSequenceNumber}
                </StackItem>
                <StackItem>{dataView}</StackItem>
            </Stack>
        </Accordion>
    );
}

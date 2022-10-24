/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack } from "@fluentui/react";
import React from "react";
import ReactJson from "react-json-view";

import { IPendingMessage } from "@fluidframework/container-runtime";

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
    message: IPendingMessage;
}

/**
 * Simple view for a single op (message).
 */
export function OpView(props: OpViewProps): React.ReactElement {
    const { message } = props;

    const header = (
        <Stack>
            <div>
                <b>Pending Op #{message.clientSequenceNumber}</b>:{" "}
            </div>
        </Stack>
    );

    let dataView: React.ReactElement = <></>;
    if (message.content !== undefined) {
        /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
        const json = JSON.parse(message.content);
        dataView = (
            <Accordion header={<b>Raw Data</b>}>
                <ReactJson src={json} />
            </Accordion>
        );
        /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
    }

    return (
        <Accordion header={header}>
            <Stack>
                <div>
                    <b>Type: </b>
                    {message.type}
                </div>
                <div>
                    <b>Reference sequence number: </b>
                    {message.referenceSequenceNumber}
                </div>
                {dataView}
            </Stack>
        </Accordion>
    );
}

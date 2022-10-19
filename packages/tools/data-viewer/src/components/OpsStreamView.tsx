import { Stack } from "@fluentui/react";
import React from "react";

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

import { Accordion } from "./Accordion";

// TODOs:
// - Why am I only seeing the most recent op?
// - Show pending local ops (styled differently)
//   - Set styling back to default once acknowledged.
// - Differentiate my ops from others' ops
// - Option to hide ops prior to snapshot
// - Show snapshot

/**
 * {@link OpsStreamView} input props.
 */
export interface OpsStreamViewProps {
    /**
     * The list of ops to render.
     */
    ops: readonly ISequencedDocumentMessage[];

    /**
     * Current minimum sequence number of the container.
     */
    minimumSequenceNumber: number;
}

/**
 * Displays information about the ops stream for the current container.
 */
export function OpsStreamView(props: OpsStreamViewProps): React.ReactElement {
    const { ops, minimumSequenceNumber } = props;

    const reversedOpsList = [...ops].reverse(); // Copy to avoid mutating input

    return (
        <Stack>
            <div>
                <b>Minimum sequence number: </b>
                {minimumSequenceNumber}
            </div>
            <h3>Ops</h3>
            <Stack>
                {reversedOpsList.map((message) => (
                    <OpView key={message.sequenceNumber} message={message} />
                ))}
            </Stack>
        </Stack>
    );
}

interface OpViewProps {
    message: ISequencedDocumentMessage;
}

function OpView(props: OpViewProps): React.ReactElement {
    const { message } = props;

    const opTimeStamp = new Date(message.timestamp);
    const nowTimeStamp = new Date();

    const wasOpToday = nowTimeStamp.getDate() === opTimeStamp.getDate();

    const header = (
        <Stack>
            <div>
                <b>Op #{message.sequenceNumber}</b>:{" "}
                {wasOpToday ? opTimeStamp.toTimeString() : opTimeStamp.toDateString()}
            </div>
        </Stack>
    );

    return (
        <Accordion header={header}>
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
                    {message.clientId}
                </div>
                <div>
                    <b>Type: </b>
                    {message.type}
                </div>
                <div>TODO: other op details</div>
            </Stack>
        </Accordion>
    );
}

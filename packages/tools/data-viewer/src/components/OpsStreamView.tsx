import { Stack } from "@fluentui/react";
import React from "react";

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

import { OpView } from "./OpView";

// TODOs:
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

    /**
     * The client ID for the session.
     */
    clientId: string | undefined;
}

/**
 * Displays information about the ops stream for the current container.
 */
export function OpsStreamView(props: OpsStreamViewProps): React.ReactElement {
    const { ops, minimumSequenceNumber, clientId } = props;

    const reversedOpsList = [...ops].reverse(); // Copy to avoid mutating input

    return (
        <Stack
            styles={{
                root: {
                    height: "100%",
                },
            }}
        >
            <div>
                <b>Minimum sequence number: </b>
                {minimumSequenceNumber}
            </div>
            <h3>Ops</h3>
            <Stack>
                {reversedOpsList.map((message) => (
                    <OpView key={message.sequenceNumber} message={message} clientId={clientId} />
                ))}
            </Stack>
        </Stack>
    );
}

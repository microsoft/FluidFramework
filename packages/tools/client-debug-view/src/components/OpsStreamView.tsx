/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import React from "react";

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

import { HasClientDebugger } from "../CommonProps";
import { useMinimumSequenceNumber, useMyClientId } from "../ReactHooks";
import { OpViewProps } from "./client-data-views";

// TODOs:
// - Show pending local ops (styled differently)
//   - Set styling back to default once acknowledged.
// - Show snapshot
// - Option to hide ops prior to snapshot

/**
 * {@link OpsStreamView} input props.
 */
export interface OpsStreamViewProps extends HasClientDebugger {
    /**
     * Callback to render data about an individual operation (op).
     */
    onRenderOp(props: OpViewProps): React.ReactElement;
}

/**
 * Displays information about the ops stream for the current container.
 */
export function OpsStreamView(props: OpsStreamViewProps): React.ReactElement {
    const { clientDebugger, onRenderOp } = props;

    const myClientId = useMyClientId(clientDebugger);
    const minimumSequenceNumber = useMinimumSequenceNumber(clientDebugger);

    const [opsLog, setOpsLog] = React.useState<readonly ISequencedDocumentMessage[]>(
        clientDebugger.getOpsLog(),
    );

    React.useEffect(() => {
        function onIncomingOpProcessed(): void {
            setOpsLog(clientDebugger.getOpsLog());
        }

        clientDebugger.on("incomingOpProcessed", onIncomingOpProcessed);

        return (): void => {
            clientDebugger.off("incomingOpProcessed", onIncomingOpProcessed);
        };
    }, [clientDebugger, setOpsLog]);

    // Reverse log ordering to put newer entries at the top.
    const reversedLog = [...opsLog].reverse();

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
            <Stack
                styles={{
                    root: {
                        height: "100%",
                        overflowY: "auto",
                    },
                }}
            >
                {reversedLog.map((op) => (
                    <StackItem key={op.sequenceNumber}>{onRenderOp({ op, myClientId })}</StackItem>
                ))}
            </Stack>
        </Stack>
    );
}

import { Stack } from "@fluentui/react";
import React from "react";

import { IFluidContainer } from "@fluidframework/fluid-static";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

import { getInnerContainer } from "../Utilities";
import { Accordion } from "./Accordion";

// TODOs:
// - Why am I only seeing the most recent op?
// - Show pending local ops (styled differently)
//   - Set styling back to default once acknowledged.
// - Differentiate my ops from others' ops

/**
 * {@link OpsStreamView} input props.
 */
export interface OpsStreamViewProps {
    /**
     * The Fluid container for which ops data will be displayed.
     */
    container: IFluidContainer;
}

/**
 * Displays information about the ops stream for the current container.
 */
export function OpsStreamView(props: OpsStreamViewProps): React.ReactElement {
    const { container } = props;

    const innerContainer = getInnerContainer(container);

    const [minimumSequenceNumber, updateMinimumSequenceNumber] = React.useState<number>(
        innerContainer.deltaManager.minimumSequenceNumber,
    );

    const [ops, updateOps] = React.useState<ISequencedDocumentMessage[]>([]);

    React.useEffect(() => {
        // eslint-disable-next-line unicorn/consistent-function-scoping
        function onOp(message: ISequencedDocumentMessage): void {
            updateMinimumSequenceNumber(message.minimumSequenceNumber);

            updateOps([...ops, message]);
        }
        innerContainer.on("op", onOp);

        return (): void => {
            innerContainer.off("op", onOp);
        };
    }, [innerContainer, ops]);

    return (
        <Stack>
            <div>
                <b>Minimum sequence number: </b>
                {minimumSequenceNumber}
            </div>
            <h3>Ops</h3>
            <Stack>
                {ops.map((message) => (
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

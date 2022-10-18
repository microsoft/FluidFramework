import { Stack } from "@fluentui/react";
import React from "react";

import { IFluidContainer } from "@fluidframework/fluid-static";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

import { getInnerContainer } from "../Utilities";

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
    const { deltaManager } = innerContainer;

    const [minimumSequenceNumber, updateMinimumSequenceNumber] = React.useState<number>(
        deltaManager.minimumSequenceNumber,
    );

    React.useEffect(() => {
        function onOp(message: ISequencedDocumentMessage): void {
            updateMinimumSequenceNumber(message.minimumSequenceNumber);
        }
        deltaManager.on("op", onOp);

        return (): void => {
            deltaManager.off("op", onOp);
        };
    }, [deltaManager]);

    return (
        <Stack>
            <div>TODO</div>
            <div>
                <b>Minimum sequence number: </b>
                {minimumSequenceNumber}
            </div>
        </Stack>
    );
}

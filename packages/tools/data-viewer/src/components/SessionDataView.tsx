/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IOverflowSetItemProps, IconButton, Link, OverflowSet, Stack } from "@fluentui/react";
import React from "react";

import { IFluidContainer, IMember, IServiceAudience } from "@fluidframework/fluid-static";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

import { RendererOptions } from "../RendererOptions";
import { getInnerContainer } from "../Utilities";
import { AudienceView } from "./AudienceView";
import { ContainerDataView } from "./ContainerDataView";
import { ContainerSummaryView } from "./ContainerSummaryView";
import { DataObjectsView } from "./DataObjectsView";
import { OpsStreamView } from "./OpsStreamView";

/**
 * {@link SessionDataView} input props.
 */
export interface SessionDataViewProps {
    /**
     * ID of {@link ContainerDataViewProps.container | the container}.
     */
    containerId: string;

    /**
     * The Fluid container for which data will be displayed.
     */
    container: IFluidContainer;

    /**
     * Audience information.
     */
    audience: IServiceAudience<IMember>;

    /**
     * Policies for displaying debug information for shared Fluid objects.
     */
    sharedObjectRenderers: RendererOptions;
}

/**
 * Displays information about the provided container and its audience.
 *
 * @param props - See {@link SessionDataViewProps}.
 */
export function SessionDataView(props: SessionDataViewProps): React.ReactElement {
    const { containerId, container, audience, sharedObjectRenderers } = props;

    const innerContainer = getInnerContainer(container);

    const [clientId, updateClientId] = React.useState<string | undefined>(innerContainer.clientId);
    const [myself, updateMyself] = React.useState<IMember | undefined>(audience.getMyself());
    const [isContainerDisposed, updateIsContainerDisposed] = React.useState<boolean>(
        container.disposed,
    );
    const [minimumSequenceNumber, updateMinimumSequenceNumber] = React.useState<number>(
        innerContainer.deltaManager.minimumSequenceNumber,
    );
    const [ops, updateOps] = React.useState<ISequencedDocumentMessage[]>([]);
    // const [pendingLocalOps, updatePendingLocalOps] = React.useState(innerContainer.deltaManager.)

    React.useEffect(() => {
        function onConnectionChange(): void {
            updateClientId(innerContainer.clientId);
        }

        function onDispose(): void {
            updateIsContainerDisposed(true);
        }

        function onUpdateAudienceMembers(): void {
            updateMyself(audience.getMyself());
        }

        function onOp(message: ISequencedDocumentMessage): void {
            updateMinimumSequenceNumber(message.minimumSequenceNumber);
            updateOps([...ops, message]);
        }

        container.on("connected", onConnectionChange);
        container.on("disconnected", onConnectionChange);
        container.on("disposed", onDispose);

        audience.on("membersChanged", onUpdateAudienceMembers);

        innerContainer.on("op", onOp);

        return (): void => {
            container.off("connected", onConnectionChange);
            container.off("disconnected", onConnectionChange);
            container.off("disposed", onDispose);

            audience.off("membersChanged", onUpdateAudienceMembers);

            innerContainer.off("op", onOp);
        };
    }, [container, innerContainer, audience, ops]);

    const [rootViewSelection, updateRootViewSelection] = React.useState<RootView>(
        RootView.Container,
    );

    let view: React.ReactElement;
    if (isContainerDisposed) {
        view = <div>The container has been disposed.</div>;
    } else {
        let innerView: React.ReactElement;
        switch (rootViewSelection) {
            case RootView.Container:
                innerView = <ContainerDataView containerId={containerId} container={container} />;
                break;
            case RootView.Data:
                innerView = (
                    <DataObjectsView
                        initialObjects={container.initialObjects}
                        sharedObjectRenderers={sharedObjectRenderers}
                    />
                );
                break;
            case RootView.Audience:
                innerView = <AudienceView audience={audience} myself={myself} />;
                break;
            case RootView.OpsStream:
                innerView = (
                    <OpsStreamView
                        ops={ops}
                        minimumSequenceNumber={minimumSequenceNumber}
                        clientId={clientId}
                    />
                );
                break;
            default:
                throw new Error(`Unrecognized RootView selection value: "${rootViewSelection}".`);
        }
        view = (
            <Stack>
                <ViewSelectionMenu
                    currentSelection={rootViewSelection}
                    updateSelection={updateRootViewSelection}
                />
                {innerView}
            </Stack>
        );
    }

    return (
        <Stack
            tokens={{ childrenGap: 25 }}
            styles={{
                root: {
                    height: "100%",
                },
            }}
        >
            <ContainerSummaryView
                container={container}
                containerId={containerId}
                clientId={clientId}
                myself={myself}
            />
            <div style={{ width: "400px", height: "100%", overflowY: "auto" }}>{view}</div>
        </Stack>
    );
}

/**
 * Root view options for the container visualizer.
 */
enum RootView {
    Container = "Container",
    Data = "Data",
    Audience = "Audience",
    OpsStream = "Ops Stream",
}

interface ViewSelectionMenuProps {
    currentSelection: RootView;
    updateSelection(newSelection: RootView): void;
}

function ViewSelectionMenu(props: ViewSelectionMenuProps): React.ReactElement {
    const { currentSelection, updateSelection } = props;

    const options: IOverflowSetItemProps[] = Object.entries(RootView).map(([value, flag]) => ({
        key: flag,
        name: value,
    }));

    function onRenderItem(item: IOverflowSetItemProps): React.ReactElement {
        return (
            <Link
                aria-label={item.key}
                styles={{ root: { marginRight: 10 } }}
                disabled={item.key === currentSelection}
                onClick={(): void => updateSelection(item.key as RootView)}
            >
                {item.name}
            </Link>
        );
    }

    function onRenderOverflowButton(
        overflowItems: IOverflowSetItemProps[] | undefined,
    ): React.ReactElement {
        return overflowItems === undefined ? (
            <></>
        ) : (
            <IconButton
                title="More options"
                menuIconProps={{ iconName: "More" }}
                menuProps={{ items: overflowItems }}
            />
        );
    }

    return (
        <OverflowSet
            aria-label="Debug root view selection"
            items={options}
            onRenderItem={onRenderItem}
            onRenderOverflowButton={onRenderOverflowButton}
        />
    );
}

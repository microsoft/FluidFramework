/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    DefaultPalette,
    IOverflowSetItemProps,
    IconButton,
    Link,
    OverflowSet,
    Stack,
    initializeIcons,
} from "@fluentui/react";
import React from "react";

import { IClient, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

import { RenderOptions, getRenderOptionsWithDefaults } from "../RendererOptions";
import { AudienceView } from "./AudienceView";
import { ContainerDataView } from "./ContainerDataView";
import { ContainerSummaryView } from "./ContainerSummaryView";
import { DataObjectsView } from "./DataObjectsView";
import { OpsStreamView } from "./OpsStreamView";
import { HasClientDebugger, HasContainerId } from "../CommonProps";
import {useMyAudienceData} from "../ReactHooks";

// TODOs:
// - Allow consumers to specify additional tabs / views for list of inner app view options.
// - History of client ID changes

// Initialize Fluent icons used this library's components.
initializeIcons();

/**
 * {@link ClientDebugView} input props.
 */
export interface ClientDebugViewProps extends HasClientDebugger, HasContainerId {
    /**
     * Rendering policies for different kinds of Fluid client and object data.
     *
     * @defaultValue Strictly use default visualization policies.
     */
    renderOptions?: RenderOptions;
}

/**
 * Displays information about the provided container and its audience.
 */
export function ClientDebugView(props: ClientDebugViewProps): React.ReactElement {
    const { containerId, clientDebugger, renderOptions: userRenderOptions } = props;

    const renderOptions: Required<RenderOptions> = getRenderOptionsWithDefaults(userRenderOptions);

    // TODO: unify state management, since it's now all bound to one object

    const [isContainerClosed, setIsContainerClosed] = React.useState<boolean>(
        clientDebugger.isContainerClosed(),
    );
    const [clientId, setClientId] = React.useState<string | undefined>(container.clientId);

    const [minimumSequenceNumber, setMinimumSequenceNumber] = React.useState<number>(
        container.deltaManager.minimumSequenceNumber,
    );

    React.useEffect(() => {
        function onContainerClose(): void {
            setIsContainerClosed(true);
        }

        clientDebugger.on("containerClosed", onContainerClose);
        clientDebugger.on("containerConnected", onConnectionChange);
        clientDebugger.on("containerDisconnected", onConnectionChange);

        return (): void => {
            clientDebugger.off("containerClosed", onContainerClose);
            clientDebugger.off("containerConnected", onConnectionChange);
            clientDebugger.off("containerDisconnected", onConnectionChange);
        };
    }, [clientDebugger, setIsContainerClosed, setClientId, setMinimumSequenceNumber, setOps]);

    // UI state
    const [rootViewSelection, updateRootViewSelection] = React.useState<RootView>(
        RootView.Container,
    );

    let view: React.ReactElement;
    if (isContainerClosed) {
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
                        renderOptions={renderOptions.sharedObjectRenderOptions}
                    />
                );
                break;
            case RootView.Audience:
                innerView = (
                    <AudienceView
                        audience={audience}
                        myself={myself}
                        onRenderAudienceMember={renderOptions.onRenderAudienceMember}
                    />
                );
                break;
            case RootView.OpsStream:
                innerView = (
                    <OpsStreamView
                        ops={ops}
                        minimumSequenceNumber={minimumSequenceNumber}
                        clientId={clientId}
                        onRenderOp={renderOptions.onRenderOp}
                    />
                );
                break;
            default:
                throw new Error(`Unrecognized RootView selection value: "${rootViewSelection}".`);
        }
        view = (
            <Stack tokens={{ childrenGap: 10 }}>
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
            tokens={{
                // Add some spacing between the menu and the inner view
                childrenGap: 25,
            }}
            styles={{
                root: {
                    height: "100%",
                    width: "400px",
                    background: DefaultPalette.neutralLighterAlt,
                },
            }}
        >
            <ContainerSummaryView
                clientDebugger={clientDebugger}
            />
            <div style={{ width: "100%", height: "100%", overflowY: "auto" }}>{view}</div>
        </Stack>
    );
}

/**
 * Root view options for the container visualizer.
 */
enum RootView {
    /**
     * Corresponds with {@link ContainerDataView}.
     */
    Container = "Container",

    /**
     * Corresponds with {@link DataObjectsView}.
     */
    Data = "Data",

    /**
     * Corresponds with {@link AudienceView}.
     */
    Audience = "Audience",

    /**
     * Corresponds with {@link OpsStreamView}.
     */
    OpsStream = "Ops Stream",
}

/**
 * {@link ViewSelectionMenu} input props.
 */
interface ViewSelectionMenuProps {
    /**
     * The currently-selected inner app view.
     */
    currentSelection: RootView;

    /**
     * Updates the inner app view to the one specified.
     */
    updateSelection(newSelection: RootView): void;
}

/**
 * Menu for selecting the inner app view to be displayed.
 */
function ViewSelectionMenu(props: ViewSelectionMenuProps): React.ReactElement {
    const { currentSelection, updateSelection } = props;

    const options: IOverflowSetItemProps[] = Object.entries(RootView).map(([_, flag]) => ({
        key: flag,
    }));

    /**
     * Specifies how to render an individual menu option.
     */
    function onRenderItem(item: IOverflowSetItemProps): React.ReactElement {
        return (
            <Link
                aria-label={item.key}
                styles={{ root: { marginRight: 10 } }}
                disabled={item.key === currentSelection}
                onClick={(): void => updateSelection(item.key as RootView)}
            >
                {item.key}
            </Link>
        );
    }

    /**
     * Specifies how to render any overflow options in the menu.
     */
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
            // TODO: We can add additional menu options here. Reserved for less-frequently used views items.
            // overflowItems={}
            onRenderItem={onRenderItem}
            onRenderOverflowButton={onRenderOverflowButton}
        />
    );
}

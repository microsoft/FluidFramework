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

import { IFluidContainer, IMember, IServiceAudience } from "@fluidframework/fluid-static";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

import { RenderOptions, getRenderOptionsWithDefaults } from "../RendererOptions";
import { getInnerContainer } from "../Utilities";
import { AudienceView } from "./AudienceView";
import { ContainerDataView } from "./ContainerDataView";
import { ContainerSummaryView } from "./ContainerSummaryView";
import { DataObjectsView } from "./DataObjectsView";
import { OpsStreamView } from "./OpsStreamView";

// TODOs:
// - Allow consumers to specify additional tabs / views for list of inner app view options.
// - History of client ID changes

// Initialize Fluent icons used this library's components.
initializeIcons();

/**
 * {@link ClientDebugView} input props.
 */
export interface ClientDebugViewProps {
    /**
     * ID of {@link ClientDebugViewProps.container | the container}.
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
     * Rendering policies for different kinds of Fluid client and object data.
     */
    renderOptions?: RenderOptions;
}

/**
 * Audience member history information. Record each member comes and goes.
 */
export interface AudienceHistory {
    /**
     * Audience member ID.
     */
    audienceMemberId?: string;

    /**
     * Event time stamp.
     */
    timestamp: number;

    /**
     * Add or Remove
     */
    type: string;
}

/**
 * Displays information about the provided container and its audience.
 */
export function ClientDebugView(props: ClientDebugViewProps): React.ReactElement {
    const { containerId, container, audience, renderOptions: userRenderOptions } = props;

    const renderOptions: Required<RenderOptions> = getRenderOptionsWithDefaults(userRenderOptions);

    // #region Audience state

    const [myself, updateMyself] = React.useState<IMember | undefined>(audience.getMyself());
    const [history, updateHistory] = React.useState<AudienceHistory[]>([{audienceMemberId: myself?.userId, timestamp: Date.now(), type: "Add"}]);

    React.useEffect(() => {
        function onUpdateAudienceMembers(): void {
            updateMyself(audience.getMyself());
        }

        audience.on("memberRemoved", (clientId: string, member: IMember) => {
            updateHistory([...history, {audienceMemberId: member.userId, timestamp: Date.now(), type: "Remove"}]);
          });
        audience.on("memberAdded", (clientId: string, member: IMember) => {
            updateHistory([...history, {audienceMemberId: member.userId, timestamp: Date.now(), type: "Add"}]);
          });


        return (): void => {
            audience.off("membersChanged", onUpdateAudienceMembers);
        };
    }, [audience, updateMyself, history, updateHistory]);

    // #endregion

    // #region State bound to the outer container

    const [isContainerDisposed, updateIsContainerDisposed] = React.useState<boolean>(
        container.disposed,
    );

    React.useEffect(() => {
        function onDispose(): void {
            updateIsContainerDisposed(true);
        }

        container.on("disposed", onDispose);

        return (): void => {
            container.off("disposed", onDispose);
        };
    }, [container, updateIsContainerDisposed]);

    // #endregion

    const innerContainer = getInnerContainer(container);

    // #region State bound to the inner container / deltaManager

    const [clientId, updateClientId] = React.useState<string | undefined>(innerContainer.clientId);

    const [minimumSequenceNumber, updateMinimumSequenceNumber] = React.useState<number>(
        innerContainer.deltaManager.minimumSequenceNumber,
    );
    const [ops, updateOps] = React.useState<ISequencedDocumentMessage[]>([]);

    React.useEffect(() => {
        function onConnectionChange(): void {
            updateClientId(innerContainer.clientId);
        }

        function onOp(message: ISequencedDocumentMessage): void {
            updateMinimumSequenceNumber(message.minimumSequenceNumber);
            updateOps([...ops, message]);
        }

        innerContainer.on("connected", onConnectionChange);
        innerContainer.on("disconnected", onConnectionChange);
        innerContainer.on("op", onOp);

        return (): void => {
            innerContainer.off("connected", onConnectionChange);
            innerContainer.off("disconnected", onConnectionChange);
            innerContainer.off("op", onOp);
        };
    }, [innerContainer, updateClientId, updateMinimumSequenceNumber, ops, updateOps]);

    // #endregion

    // UI state
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
                        renderOptions={renderOptions.sharedObjectRenderOptions}
                    />
                );
                break;
            case RootView.Audience:
                innerView = (
                    <AudienceView
                        audience={audience}
                        history={history}
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
                container={container}
                containerId={containerId}
                clientId={clientId}
                myself={myself}
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

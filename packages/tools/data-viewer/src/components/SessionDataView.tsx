/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    IOverflowSetItemProps,
    IStackItemStyles,
    IconButton,
    Link,
    OverflowSet,
    Stack,
} from "@fluentui/react";
import React from "react";

import { IFluidContainer, IMember, IServiceAudience } from "@fluidframework/fluid-static";

import { AudienceView } from "./AudienceView";
import { ContainerDataView } from "./ContainerDataView";
import { ContainerSummaryView } from "./ContainerSummaryView";
import { OpsStreamView } from "./OpsStreamView";

const sessionDataViewStyles: IStackItemStyles = {
    root: {
        verticalFill: true,
    },
};

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
}

/**
 * Displays information about the provided container and its audience.
 *
 * @param props - See {@link SessionDataViewProps}.
 */
export function SessionDataView(props: SessionDataViewProps): React.ReactElement {
    const { containerId, container, audience } = props;

    const [myself, updateMyself] = React.useState<IMember | undefined>(audience.getMyself());
    const [isContainerDisposed, updateIsContainerDisposed] = React.useState<boolean>(
        container.disposed,
    );

    React.useEffect(() => {
        function onDispose(): void {
            updateIsContainerDisposed(true);
        }

        function onUpdateAudienceMembers(): void {
            updateMyself(audience.getMyself());
        }

        container.on("disposed", onDispose);
        audience.on("membersChanged", onUpdateAudienceMembers);

        return (): void => {
            container.off("disposed", onDispose);
            audience.off("membersChanged", onUpdateAudienceMembers);
        };
    }, [container, audience]);

    const [rootViewSelection, updateRootViewSelection] = React.useState<RootView>(
        RootView.Container,
    );

    let view: React.ReactElement;
    if (isContainerDisposed) {
        view = <div>The container has been disposed.</div>;
    } else {
        switch (rootViewSelection) {
            case RootView.Container:
                view = <ContainerDataView containerId={containerId} container={container} />;
                break;
            case RootView.Audience:
                view = <AudienceView audience={audience} myself={myself} />;
                break;
            case RootView.OpsStream:
                view = <OpsStreamView container={container} />;
                break;
            default:
                throw new Error(`Unrecognized RootView selection value: "${rootViewSelection}".`);
        }
    }

    return (
        <div>
            <Stack tokens={{ childrenGap: 25 }} styles={sessionDataViewStyles}>
                <ContainerSummaryView
                    container={container}
                    containerId={containerId}
                    myself={myself}
                />
                <ViewSelectionMenu
                    currentSelection={rootViewSelection}
                    updateSelection={updateRootViewSelection}
                />
                <div style={{ width: "400px", height: "100%", overflowY: "auto" }}>{view}</div>
            </Stack>
        </div>
    );
}

/**
 * Root view options for the container visualizer.
 */
enum RootView {
    Container = "Container",
    Audience = "Audience",
    OpsStream = "Ops Stream",
}

interface ViewSelectionMenuProps {
    currentSelection: RootView;
    updateSelection(newSelection: RootView): void;
}

function ViewSelectionMenu(props: ViewSelectionMenuProps): React.ReactElement {
    // eslint-disable-next-line @typescript-eslint/unbound-method
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

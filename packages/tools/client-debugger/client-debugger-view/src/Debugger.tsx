/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IconButton, Stack, StackItem, TooltipHost } from "@fluentui/react";
import { useId } from "@fluentui/react-hooks";
import { Resizable } from "re-resizable";
import React from "react";

import {
    DebuggerRegistry,
    IFluidClientDebugger,
    getFluidClientDebuggers,
    getFluidClientDebugger,
    getDebuggerRegistry,
} from "@fluid-tools/client-debugger";

import { HasContainerId } from "./CommonProps";
import { RenderOptions } from "./RendererOptions";
import { ClientDebugView } from "./components";
import { ContainerSelectionDropdown } from "./components/ContainerSelectionDropdown";

/**
 * {@link FluidClientDebugger} input props.
 */
export interface FluidClientDebuggerProps {
    /**
     * Rendering policies for different kinds of Fluid client and object data.
     *
     * @defaultValue Strictly use default visualization policies.
     */
    renderOptions?: RenderOptions;
}

/**
 * Renders the debug view for an active debugger session registered using
 * {@link @fluid-tools/client-debugger#initializeFluidClientDebugger}.
 *
 * @remarks If no debugger has been initialized, will display a note to the user and a refresh button to search again.
 */
export function FluidClientDebugger(props: FluidClientDebuggerProps): React.ReactElement {
    function getFirstDebugger(): IFluidClientDebugger | undefined {
        const debuggers = getFluidClientDebuggers();
        return debuggers.length === 0 ? undefined : debuggers[0];
    }

    const [clientDebuggers, setClientDebuggers] = React.useState<IFluidClientDebugger[]>(getFluidClientDebuggers());

    const [selectedContainerId, setSelectedContainerId] = React.useState<string>(
        getFirstDebugger()?.containerId ?? "",
    );

    const [clientDebugger, setClientDebugger] = React.useState<IFluidClientDebugger | undefined>(
        selectedContainerId === undefined ? undefined : getFluidClientDebugger(selectedContainerId),
    );

    const [isContainerDisposed, setIsContainerDisposed] = React.useState<boolean>(
        clientDebugger?.disposed ?? false,
    );

    const debuggerRegistry: DebuggerRegistry = getDebuggerRegistry();

    React.useEffect(() => {
        function onDebuggerDisposed(): void {
            setIsContainerDisposed(true);
        }

        function onDebuggerChanged(): void {
            setClientDebuggers(getFluidClientDebuggers());
        }

        debuggerRegistry.on("debuggerRegistered", onDebuggerChanged);
        debuggerRegistry.on("debuggerClosed", onDebuggerChanged);
        clientDebugger?.on("disposed", onDebuggerDisposed);

        return (): void => {
            clientDebugger?.off("disposed", onDebuggerDisposed);
            debuggerRegistry.off("debuggerRegistered", onDebuggerChanged);
            debuggerRegistry.off("debuggerClosed", onDebuggerChanged);
        };
    }, [clientDebugger, clientDebuggers, setIsContainerDisposed, setClientDebuggers]);

    let view: React.ReactElement;
    if (clientDebugger === undefined) {
        view = (
            <NoDebuggerInstance
                containerId={"No container found"}
                onRetryDebugger={(): void => {
                    setClientDebuggers(getFluidClientDebuggers());
                    setClientDebugger(getFirstDebugger());
                    setSelectedContainerId(getFirstDebugger()?.containerId ?? "");
                }}
            />
        );
    } else if (isContainerDisposed) {
        view = (
            <DebuggerDisposed
                containerId={clientDebugger.containerId}
                onRetryDebugger={(): void => {
                    setClientDebuggers(getFluidClientDebuggers());
                    setClientDebugger(getFirstDebugger());
                    setSelectedContainerId(clientDebugger?.containerId);
                }}
            />
        );
    } else {
        view = (
            <ClientDebugView
                containerId={clientDebugger.containerId}
                clientDebugger={clientDebugger}
            />
        );
    }

    const slectionView: React.ReactElement = (
        <ContainerSelectionDropdown
            containerId={selectedContainerId}
            clientDebuggers={clientDebuggers}
            onChangeSelection={(containerId): void => setSelectedContainerId(containerId)}
        />
    );

    return (
        <Resizable
            style={{
                position: "absolute",
                width: "400px",
                height: "100%",
                top: "0px",
                right: "0px",
                bottom: "0px",
                zIndex: "2",
                backgroundColor: "lightgray", // TODO: remove
            }}
            className={"debugger-panel"}
        >
            {slectionView}
            {view}
        </Resizable>
    );
}

/**
 * Base props interface used by components below which can re-attempt to find the debugger instance
 * associated with some Container ID.
 */
interface CanLookForDebugger {
    /**
     * Retry looking for the debugger instance.
     */
    onRetryDebugger(): void;
}

/**
 * {@link NoDebuggerInstance} input props.
 */
interface NoDebuggerInstanceProps extends HasContainerId, CanLookForDebugger {}

function NoDebuggerInstance(props: NoDebuggerInstanceProps): React.ReactElement {
    const { containerId, onRetryDebugger } = props;

    const retryButtonTooltipId = useId("retry-button-tooltip");

    // TODO: give more info and link to docs, etc. for using the tooling.
    return (
        <Stack horizontalAlign="center" tokens={{ childrenGap: 10 }}>
            <StackItem>
                <div>No debugger has been initialized for container ID "{containerId}".</div>
            </StackItem>
            <StackItem>
                <TooltipHost content="Look again" id={retryButtonTooltipId}>
                    <IconButton
                        onClick={onRetryDebugger}
                        menuIconProps={{ iconName: "Refresh" }}
                        aria-describedby={retryButtonTooltipId}
                    />
                </TooltipHost>
            </StackItem>
        </Stack>
    );
}

/**
 * {@link DebuggerDisposed} input props.
 */
interface DebuggerDisposedProps extends HasContainerId, CanLookForDebugger {}

function DebuggerDisposed(props: DebuggerDisposedProps): React.ReactElement {
    const { containerId, onRetryDebugger } = props;

    const retryButtonTooltipId = useId("retry-button-tooltip");

    return (
        <Stack horizontalAlign="center" tokens={{ childrenGap: 10 }}>
            <StackItem>
                <div>
                    The debugger associated with container ID "{containerId}" has been disposed.
                </div>
            </StackItem>
            <StackItem>
                <TooltipHost content="Look again" id={retryButtonTooltipId}>
                    <IconButton
                        onClick={onRetryDebugger}
                        menuIconProps={{ iconName: "Refresh" }}
                        aria-describedby={retryButtonTooltipId}
                    />
                </TooltipHost>
            </StackItem>
        </Stack>
    );
}

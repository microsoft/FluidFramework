import { Spinner, Stack } from "@fluentui/react";
import React from "react";

import { FluidObject, IFluidHandle } from "@fluidframework/core-interfaces";
import { FluidObjectHandle } from "@fluidframework/datastore";
import { SharedObjectCore } from "@fluidframework/shared-object-base";

import { RendererOptions } from "../../RendererOptions";

/**
 * {@link DynamicDataView} input props.
 */
export interface DynamicDataViewProps {
    data: unknown;
    sharedObjectRenderers: RendererOptions;
}

export function DynamicDataView(props: DynamicDataViewProps): React.ReactElement {
    const { data, sharedObjectRenderers } = props;

    // Render primitives and falsy types via their string representation
    if (typeof data !== "object") {
        return <>{data}</>;
    }

    if (data instanceof FluidObjectHandle) {
        return (
            <FluidObjectView
                fluidObjectHandle={data}
                sharedObjectRenderers={sharedObjectRenderers}
            />
        );
    }

    // If the underlying data was not a primitive, and it wasn't a Fluid handle, it must be serializable data.
    // But that serializable data might contain Fluid handles as descendents, so we can't just
    // display json or something.
    return <Stack>TODO: raw data view</Stack>;
}

/**
 * {@link FluidObjectView} input props.
 */
export interface FluidObjectViewProps {
    fluidObjectHandle: IFluidHandle;
    sharedObjectRenderers: RendererOptions;
}

export function FluidObjectView(props: FluidObjectViewProps): React.ReactElement {
    const { fluidObjectHandle, sharedObjectRenderers } = props;

    // eslint-disable-next-line unicorn/no-useless-undefined
    const [resolvedData, updatedResolvedData] = React.useState<FluidObject | undefined>(undefined);

    React.useEffect(() => {
        fluidObjectHandle.get().then(updatedResolvedData, (error) => {
            throw error;
        });
    }, [resolvedData]);

    if (resolvedData === undefined) {
        return <Spinner />;
    }

    // TODO: is this the right type check for this?
    if (resolvedData instanceof SharedObjectCore) {
        return sharedObjectRenderers[resolvedData.attributes.type] === undefined ? (
            <Stack>
                <Stack.Item>
                    No renderer provided for shared object type "{resolvedData.attributes.type}"
                </Stack.Item>
            </Stack>
        ) : (
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            sharedObjectRenderers[resolvedData.attributes.type](resolvedData, (data) => (
                <DynamicDataView data={data} sharedObjectRenderers={sharedObjectRenderers} />
            ))
        );
    }

    return <Stack>Unrecognized kind of Fluid data: {resolvedData.toString()}</Stack>;
}

export interface RecordDataViewProps {
    data: Record<string, unknown>;
    sharedObjectRenderers: RendererOptions;
}

export function RecordDataView(props: RecordDataViewProps): React.ReactElement {
    const { data, sharedObjectRenderers } = props;

    const entries = Object.entries(data);
    return (
        <Stack>
            {entries.map(([key, value]) => (
                <Stack.Item key={key}>
                    <DynamicDataView data={value} sharedObjectRenderers={sharedObjectRenderers} />
                </Stack.Item>
            ))}
        </Stack>
    );
}

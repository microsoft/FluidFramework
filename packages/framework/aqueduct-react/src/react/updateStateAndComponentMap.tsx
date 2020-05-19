import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentHandle, IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
import { IDirectoryValueChanged } from "@microsoft/fluid-map-component-definitions";
import {
    FluidComponentMap,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    IRootConverter,
    IViewConverter,
    instanceOfIComponentLoadable,
    ViewToFluidMap,
    FluidToViewMap,
} from "./interface";

export function getViewFromRoot<SV, SF>(
    root: ISharedDirectory,
    rootKey: keyof SF,
    stateKey: keyof SV,
    fluidComponentMap: FluidComponentMap,
    fluidToView?: Map<keyof SF, IViewConverter<SV,SF>>,
    combinedRootState?: Partial<SF>,
): Partial<SV> {
    const syncedState = root.get("syncedState");
    let value = syncedState[rootKey];
    if (combinedRootState) {
        value = combinedRootState[rootKey] || value;
    }
    const viewConverter = fluidToView && fluidToView.get(rootKey)?.viewConverter;
    if (viewConverter) {
        const partialRootState: Partial<SF> = {};
        partialRootState[rootKey] = value;
        return viewConverter(partialRootState, fluidComponentMap);
    } else {
        const partialViewState: Partial<SV> = {};
        const convertedValue = value.IComponentHandle ? fluidComponentMap.get((value as IComponentHandle)) : value;
        partialViewState[stateKey] = convertedValue;
        return partialViewState;
    }
}

export function getRootFromView<SV, SF>(
    state: SV,
    rootKey: keyof SF,
    stateKey: keyof SV,
    viewToFluid?: Map<keyof SV, IRootConverter<SV,SF>>,
): Partial<SF> {
    const value = state[stateKey];
    const rootConverter = viewToFluid && viewToFluid.get(stateKey)?.rootConverter;
    if (rootConverter) {
        const partialViewState: Partial<SV> = {};
        partialViewState[stateKey] = value;
        return rootConverter(partialViewState);
    } else {
        const partialRootState: Partial<SF> = {};
        const convertedValue = instanceOfIComponentLoadable(value)
            ? (value as IComponentLoadable).handle : value;
        partialRootState[rootKey] = convertedValue as any;
        return partialRootState;
    }
}

export function getByValue<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState,
>(searchValue: string, map?: Map<keyof SV, IRootConverter<SV,SF>>) {
    if (map !== undefined) {
        for (const [key, value] of map.entries()) {
            if (value.rootKey === searchValue)
            {return key;}
        }
    }
}

export async function asyncForEach(array, callback, ...args) {
    for (const value of array) {
        await callback(value, ...args);
    }
}

const addComponent = async <
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
> (
    handle: IComponentHandle,
    fluidComponentMap: FluidComponentMap,
    rootCallback: (change: IDirectoryValueChanged, local: boolean) => void,
) => handle.get().then((component) => {
    if (component.IComponentPrimed) {
        component.IComponentPrimed.addListenerToRootValueChanged(rootCallback);
    }
    fluidComponentMap.set(handle, { component, isListened: true });
});

function isEquivalent(a, b) {
    const aKeys = Object.getOwnPropertyNames(a);
    const bKeys = Object.getOwnPropertyNames(b);
    if (aKeys.length !== bKeys.length) {
        return false;
    }
    for (const i of aKeys) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

export function syncStateAndRoot<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    fromRootUpdate: boolean,
    root: ISharedDirectory,
    state: SV,
    setState: (newState: SV, fromRootUpdate?: boolean | undefined) => void,
    fluidComponentMap: FluidComponentMap,
    viewToFluid?: ViewToFluidMap<SV,SF>,
    fluidToView?: FluidToViewMap<SV,SF>,
) {
    let combinedRootState = root.get<SF>("syncedState");

    const matchingStateValues = new Map<keyof SV, boolean>();
    Object.entries(state).forEach(([stateKey, stateValue], i) => {
        const matchingUnknownRootValue = combinedRootState[stateKey];
        if (typeof matchingUnknownRootValue === typeof stateValue) {
            matchingStateValues.set(stateKey as keyof SV, true);
        }
    });

    // interface MapSchemaTypes {
    //     string: string;
    //     integer: number;
    // }
    // // type MapSchema<T extends Record<string, keyof MapSchemaTypes>> = {
    // //     [K in keyof T]: MapSchemaTypes[T[K]]
    // // };
    // // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
    // function asSchema<T extends Record<string, keyof MapSchemaTypes>>(t: T): T {
    //     return t;
    // }
    // const matchingSchemaMapping = {};
    // for (const stateKey of matchingStateValues.keys()) {
    //     matchingSchemaMapping[stateKey as string] = (typeof state[stateKey]) as string;
    // }
    // const matchingSchema = asSchema(matchingSchemaMapping);
    // // type MatchedType = MapSchema<typeof matchingSchema>;
    // console.log(matchingSchema);

    if (viewToFluid) {
        viewToFluid.forEach((item, stateKey) => {
            const partialRootState = getRootFromView(
                state,
                item.rootKey,
                stateKey,
                viewToFluid,
            );
            if (fromRootUpdate) {
                combinedRootState = { ...partialRootState, ...combinedRootState };
            } else {
                combinedRootState = { ...combinedRootState, ...partialRootState };
            }
        });
    }

    let combinedViewState = { ...state };
    if (fluidToView) {
        fluidToView.forEach((item, rootKey) => {
            const partialViewState = getViewFromRoot(
                root,
                rootKey,
                item.stateKey,
                fluidComponentMap,
                fluidToView,
                combinedRootState,
            );
            if (fromRootUpdate) {
                combinedViewState = { ...combinedViewState, ...partialViewState  };
            } else {
                combinedViewState = { ...partialViewState, ...combinedViewState };
            }
        });
    }
    const currentRootState = root.get("syncedState");
    if (!isEquivalent(combinedRootState, currentRootState)) {
        root.set("syncedState", combinedRootState);
        setState(combinedViewState);
    } else {
        setState(combinedViewState);
    }
}

export const updateStateAndComponentMap = async <
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    newHandleList: IComponentHandle[],
    fluidComponentMap: FluidComponentMap,
    fromRootUpdate: boolean,
    root: ISharedDirectory,
    state: SV,
    setState: (newState: SV, fromRootUpdate?: boolean | undefined) => void,
    rootCallback: (change: IDirectoryValueChanged, local: boolean) => void,
    viewToFluid?: ViewToFluidMap<SV,SF>,
    fluidToView?: FluidToViewMap<SV,SF>,
) => asyncForEach(
    newHandleList,
    addComponent,
    fluidComponentMap,
    rootCallback,
).then(() => syncStateAndRoot(fromRootUpdate, root, state, setState, fluidComponentMap, viewToFluid, fluidToView));

export const rootCallbackListener = <SV,SF>(
    fluidComponentMap: FluidComponentMap,
    fromRootUpdate: boolean,
    root: ISharedDirectory,
    state: SV,
    setState: (newState: SV, fromRootUpdate?: boolean | undefined) => void,
    viewToFluid?: ViewToFluidMap<SV,SF>,
    fluidToView?: FluidToViewMap<SV,SF>,
) => ((change: IDirectoryValueChanged, local: boolean) => {
    if (!local) {
        console.log(change.key);
        const viewToFluidKeys: string[] = viewToFluid
            ? Array.from(viewToFluid.values()).map((item) => item.rootKey as string)
            : [];
        if (change.key === "syncedState") {
            syncStateAndRoot(fromRootUpdate, root, state, setState, fluidComponentMap, viewToFluid, fluidToView);
        } else if (viewToFluid
            && (viewToFluidKeys).includes(change.key)
            || (change.keyPrefix !== undefined && viewToFluidKeys.includes(change.keyPrefix))) {
            const rootKey = change.key;
            const stateKey = getByValue(rootKey, viewToFluid);
            if (stateKey) {
                const newPartialState = getViewFromRoot(
                    root,
                    rootKey as keyof SF,
                    stateKey,
                    fluidComponentMap,
                    fluidToView,
                );
                setState({ ...state, ...newPartialState, ...{ fluidComponentMap } }, true);
            }
        }
    }
});

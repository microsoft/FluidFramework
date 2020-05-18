/* eslint-disable @typescript-eslint/no-floating-promises */
import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { FluidComponentMap, FluidFunctionalComponentState, instanceOfIComponentLoadable } from "./interface";

async function getFromRoot<T>(root: ISharedDirectory, key: string): Promise<T> {
    const value = root.get(key);
    return value.IComponentHandle ? (value as IComponentHandle<T>).get() : value as T;
}

function getByValue(map, searchValue) {
    for (const [key, value] of map.entries()) {
        if (value === searchValue)
        {return key;}
    }
}

async function asyncForEach(array, callback, ...args) {
    for (const value of array) {
        await callback(value, ...args);
    }
}

const addComponent = async <S extends FluidFunctionalComponentState, > (
    handle: IComponentHandle,
    fluidComponentMapData: FluidComponentMap,
    root: ISharedDirectory,
    state: S,
    setState: (newState: S, fromRootUpdate?: boolean | undefined) => void,
    stateToRoot?: Map<keyof S, string>,
) => handle.get().then((component) => {
    if (component.IComponentPrimed) {
        component.IComponentPrimed.addListenerToRootValueChanged((change, local) => {
            if (stateToRoot
                && (Array.from(stateToRoot.values()).includes(change.key)
                || (change.keyPrefix !== undefined
                    && Array.from(stateToRoot.values()).includes(change.keyPrefix)))) {
                const rootKey = change.key;
                const stateKey = getByValue(stateToRoot, rootKey);
                getFromRoot(root, rootKey).then((newData) => {
                    if (newData !== state[stateKey] || instanceOfIComponentLoadable(newData)) {
                        const newState: Partial<S> = {};
                        newState.isInitialized = true;
                        newState[stateKey] = newData as any;
                        setState({ ...state, newState }, true);
                    }
                });
            }
        });
    }
    fluidComponentMapData.set(handle, { component, isListened: true });
});

export const updateStateAndComponentMap = async <S extends FluidFunctionalComponentState,>(
    newHandleList: IComponentHandle[],
    fluidComponentMap: FluidComponentMap,
    root: ISharedDirectory,
    state: S,
    setState: (newState: S, fromRootUpdate?: boolean | undefined) => void,
    stateToRoot?: Map<keyof S, string>,
) => asyncForEach(
    newHandleList,
    addComponent,
    fluidComponentMap,
    root,
    state,
    setState,
    stateToRoot,
).then(() => {
    state.isInitialized = true;
    state.fluidComponentMap = fluidComponentMap;
    setState(state);
});

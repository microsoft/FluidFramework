import { SharedCounter } from "@fluidframework/counter";
import { setFluidSyncedCounterConfig, useSyncedCounterReducerFluid } from "./fluidSyncedCounter";
/**
 * Function to set the config for a synced counter on a syncedDataObject's SharedMap synced state. This
 * will initialize and provide a SharedCount for the view to use. This SharedString provided is automatically
 * bound to the state update of the functional view useSyncedCounter is called in.
 * @param syncedDataObject - The Fluid data object on which the synced state config is being set
 * @param syncedStateId - The ID of the view state that this config schema is being set for
 * @param defaultValue - The default number the view value will be set to prior to the Fluid counter initializing
 * @param sharedObjectCreate - The creation function for the SharedCounter. This can be set to pre-increment the counter
 */
export function setSyncedCounterConfig(syncedDataObject, syncedStateId, defaultValue = 0, sharedObjectCreate = SharedCounter.create) {
    setFluidSyncedCounterConfig(syncedDataObject, syncedStateId, "value", "counter", { value: defaultValue }, sharedObjectCreate);
}
/**
 * Function to use the synced counter state powered by a SharedCounter that has been prepared for this view
 * @param syncedDataObject - The Fluid data object that holds the synced state config for this view
 * @param syncedStateId - The ID of this view state
 * @returns [
 *  the number that the SharedCounter has been incremented to,
 *  the reducer to modify the SharedCounter by incrementing it
 * ]
 */
export function useSyncedCounter(syncedDataObject, syncedStateId, defaultValue = 0) {
    const [state, fluidReducer] = useSyncedCounterReducerFluid(syncedDataObject, syncedStateId, "value", "counter", { value: defaultValue });
    const reducer = {
        increment: (step) => fluidReducer.increment.function(state, step),
    };
    return [state.viewState.value, reducer];
}
//# sourceMappingURL=syncedCounter.js.map
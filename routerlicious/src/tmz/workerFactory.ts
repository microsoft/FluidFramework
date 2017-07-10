import { IWorkManager} from "./messages";
import { RandomWorker } from "./randomWorker";
import { StateManager} from "./stateManager";

/**
 * Creates an worker based on parameter.
 */
export function create(type: string, manager: StateManager): IWorkManager {
    return new RandomWorker(manager);
}

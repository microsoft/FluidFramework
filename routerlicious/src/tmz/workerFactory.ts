import { IWorkManager} from "./messages";
import { RandomWorker } from "./randomWorker";

/**
 * Creates an worker based on parameter.
 */
export function create(type: string): IWorkManager {
    return new RandomWorker();
}

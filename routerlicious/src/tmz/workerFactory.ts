import { IForeman} from "./messages";
import { RandomForeman } from "./randomForeman";

/**
 * Creates an worker based on parameter.
 */
export function create(type: string): IForeman {
    return new RandomForeman();
}

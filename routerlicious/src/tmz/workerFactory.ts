import * as api from "../api-core";
import { IForeman} from "./messages";
import { RandomForeman } from "./randomForeman";

/**
 * Creates an worker based on parameter.
 */
export function create(type: string, tenantManager: api.ITenantManager): IForeman {
    return new RandomForeman(tenantManager);
}

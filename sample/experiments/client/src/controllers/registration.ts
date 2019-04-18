import * as prague from "@prague/routerlicious";

export function register(routerlicious: string, historian: string, tenantId: string) {
    prague.api.socketStorage.registerAsDefault(routerlicious, historian, tenantId);
}

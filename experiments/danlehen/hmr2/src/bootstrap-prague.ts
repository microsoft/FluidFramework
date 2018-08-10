import * as prague from "../../../../routerlicious/dist";
import api = prague.api.api;
import SharedString = prague.api.SharedString.SharedString;
import socketStorage = prague.api.socketStorage;
import * as jwt from "jsonwebtoken";

export { SharedString };

export async function open(id: string): Promise<SharedString> {
    const routerliciousUrl = "http://localhost:3000";
    const historianUrl = "http://localhost:3001";
    const tenantId = "prague";
    const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";
    
    socketStorage.registerAsDefault(routerliciousUrl, historianUrl, tenantId);
    
    const document = await api.load(id, { 
        blockUpdateMarkers: true,
        token: jwt.sign({
            documentId: id,
            permission: "read:write",
            tenantId,
            user: { id: "danlehen" },
        }, secret)
    });

    const rootView = await document.getRoot().getView();
    if (!document.existing) {
        rootView.set("text", document.createString());
    }

    return await rootView.wait("text") as SharedString;
}
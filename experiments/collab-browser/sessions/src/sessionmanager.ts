import { EventEmitter } from "events";
import * as jwt from "jsonwebtoken";
import * as loader from "../../../../routerlicious/packages/loader";
import { WebLoader, WebPlatform } from "../../../../routerlicious/packages/loader-web";
import { IMap, IMapView, MapExtension } from "../../../../routerlicious/packages/map";
import { IRuntime } from "../../../../routerlicious/packages/runtime-definitions";
import * as socketStorage from "../../../../routerlicious/packages/socket-storage";

const routerlicious = "http://localhost:3000";
const historian = "http://localhost:3001";
const verdacio = "http://localhost:4873";
const tenantId = "prague";
const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";

const documentServices = socketStorage.createDocumentService(routerlicious, historian);
const tokenService = new socketStorage.TokenService();
const rootMapId = "root";

export const propertyKey = "component";

export class SessionManager<T> extends EventEmitter {
    private runtime?: IRuntime;
    private rootMap?: IMap;
    private rootView?: IMapView;

    public async connect(runtime: IRuntime) {
        console.log("connect");
        this.runtime = runtime;
        if (this.runtime.existing) {
            console.log("existing");
            // If opening the document, get the root.
            this.rootMap = await this.runtime.getChannel(rootMapId) as IMap;
        } else {
            console.log("not existing");
            // If creating the document, create the initial structure.
            this.rootMap = this.runtime.createChannel(rootMapId, MapExtension.Type) as IMap;
            this.rootMap.attach();
        }

        this.rootMap.on("valueChanged", (change) => {
            this.emit("valueChanged", change);
        });

        console.log("before await");
        this.rootView = await this.rootMap.getView();

        console.log("finished connect");
    }

    public get sessions() {
        return this.rootView!.keys();
    }

    public addSession(id: string) {
        console.log(`Added Session: ${id}`);
        this.rootMap!.set(id, true);
    }

    public removeSession(id: string) {
        console.log(`Removed Session: ${id}`);
        this.rootMap!.delete(id);
    }

    public open(documentId: string) {
        const token = jwt.sign({
                documentId,
                permission: "read:write",       // use "read:write" for now
                tenantId,
                user: {
                    id: `session-${Math.random().toString(36).substr(2, 4)}`,
                },
            },
            secret);

        const webLoader = new WebLoader(verdacio);

        const platform = new WebPlatform(undefined as any);
        const componentP = new Promise<T>((resolver) => {
            (platform as any)[propertyKey] = resolver;
        });

        loader.load(
            token,
            null,
            platform,
            documentServices,
            webLoader,
            tokenService,
            undefined,
            true);

        return componentP;
    }
}

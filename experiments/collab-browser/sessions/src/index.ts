import * as assert from "assert";
import { EventEmitter } from "events";
import { MapExtension } from "../../../../routerlicious/packages/map";
import { IChaincode, IPlatform, IRuntime } from "../../../../routerlicious/packages/runtime-definitions";
import { CollaborativeStringExtension } from "../../../../routerlicious/packages/shared-string";
import { StreamExtension } from "../../../../routerlicious/packages/stream";
import { SessionManager, propertyKey } from "./sessionmanager";
import { SessionList } from "./sessionlist";

class Chaincode extends EventEmitter implements IChaincode {
    // Maps the given type id to the factory for that type of collaborative object.
    private readonly typeToFactory = new Map<string, any>([
        [MapExtension.Type, new MapExtension()],
        [CollaborativeStringExtension.Type, new CollaborativeStringExtension()],
        [StreamExtension.Type, new StreamExtension()],
    ]);

    // Returns the CollaborativeObject factory for the given type id.
    public getModule(type: string): any { return this.typeToFactory.get(type) || assert.fail(); }

    // NYI?
    public close() { return Promise.resolve(); }

    // Invoked by loader after all dependencies have been imported into the script context.
    public async run(runtime: IRuntime, platform: IPlatform) {
        const sessionManager = new SessionManager();
        await sessionManager.connect(runtime);

        // Smuggle runtime back to self.
        const maybeComponentR = (platform as any)[propertyKey] as (value: SessionManager<any>) => void;
        if (maybeComponentR) {
            maybeComponentR(sessionManager);
        }

        const maybeDiv = platform.queryInterface("div") as HTMLDivElement;
        if (maybeDiv) {
            const [baseUrl, queryString] = location.href.split("?");
            if (queryString) {
                // Remove the query string to prevent accidentally re-instantiating chaincode.
                history.pushState(null, "", baseUrl);
            }

            const sessionList = new SessionList();
            maybeDiv.appendChild(sessionList.mount(sessionManager));
        }
    }
}

// Initial entry point invoked by loader.
export async function instantiate(): Promise<IChaincode> {
    return new Chaincode();
}

export { SessionManager, SessionList };
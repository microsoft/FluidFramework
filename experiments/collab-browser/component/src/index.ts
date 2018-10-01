import * as assert from "assert";
import { EventEmitter } from "events";
import { MapExtension } from "../../../../routerlicious/packages/map";
import { IChaincode, IPlatform, IRuntime } from "../../../../routerlicious/packages/runtime-definitions";
import { CollaborativeStringExtension } from "../../../../routerlicious/packages/shared-string";
import { StreamExtension } from "../../../../routerlicious/packages/stream";
import { Component, componentSym } from "./component";
import { UI } from "./ui";

export class NullPlatform extends EventEmitter implements IPlatform {
    public queryInterface<T>(id: string): Promise<T> {
        throw new Error("Unexpected QI on NullPlatform.");
    }
}

export class Chaincode extends EventEmitter implements IChaincode {
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
        Component.load(runtime).then(async (component) => {
            console.log("component loaded");

            // Smuggle runtime back to self.
            const maybeComponentR = platform[componentSym] as (Component) => void;
            if (maybeComponentR) {
                maybeComponentR(component);
            }

            const maybeDiv = await platform.queryInterface("div") as HTMLDivElement;
            if (maybeDiv) {
                // Remove the query string (if any) to prevent accidentally re-instantiating chaincode.
                const [baseUrl, queryString] = location.href.split("?");
                if (queryString) {
                    history.pushState(null, "", baseUrl);
                }

                const ui = new UI(component);
                maybeDiv.appendChild(await ui.mount(platform));
            }
        });

        return platform;
    }
}

// Initial entry point invoked by loader.
export async function instantiate(): Promise<IChaincode> {
    return new Chaincode();
}

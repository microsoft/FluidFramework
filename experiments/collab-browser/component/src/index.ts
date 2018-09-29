import { MapExtension } from "@prague/map";
import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import { CollaborativeStringExtension } from "@prague/shared-string";
import { StreamExtension } from "@prague/stream";
import * as assert from "assert";
import { EventEmitter } from "events";
import { Component, componentSym } from "./component";
import { UI } from "./ui";

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
        const component = new Component();
        await component.connect(runtime);

        // Smuggle runtime back to self.
        const maybeComponentR = platform[componentSym] as (Component) => void;
        if (maybeComponentR) {
            maybeComponentR(component);
        }

        const maybeDiv = platform.queryInterface("div") as HTMLDivElement;
        if (maybeDiv) {
            // Remove the query string (if any) to prevent accidentally re-instantiating chaincode.
            const [baseUrl, queryString] = location.href.split("?");
            if (queryString) {
                history.pushState(null, "", baseUrl);
            }

            const ui = new UI(component);
            maybeDiv.appendChild(await ui.mount());
        }
    }
}

// Initial entry point invoked by loader.
export async function instantiate(): Promise<IChaincode> {
    return new Chaincode();
}

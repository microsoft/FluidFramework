import { MapExtension } from "@prague/map";
import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import { CollaborativeStringExtension } from "@prague/shared-string";
import { StreamExtension } from "@prague/stream";
import * as assert from "assert";
import { EventEmitter } from "events";
import { Component, componentSym } from "./component";

const getImage = (component: Component) => {
    const element = document.createElement("img");

    const update = async ({ change: { key }}) => {
        const { image, width, height } = await component.getImage();
        if (image) { element.src = image; }
        if (width) { element.style.width = `${width}px`; }
        if (height) { element.style.height = `${height}px`; }

        console.log(`*** UPDATE(${key}):`);
        console.log(`    Image: ${element.outerHTML}`);
    };

    /* tslint:disable:variable-name */
    component.on("valueChanged", update);
    /* tslint:enable:variable-name */

    update({ change: { key: "loaded" }});

    return element;
};

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
        console.log("run");
        const component = new Component();
        console.log("before connect");
        await component.connect(runtime);
        console.log("after connect");

        // Smuggle runtime back to self.
        const maybeComponentR = platform[componentSym] as (Component) => void;
        if (maybeComponentR) {
            maybeComponentR(component);
        }

        const maybeDiv = platform.queryInterface("div") as HTMLDivElement;
        if (maybeDiv) {
            const [baseUrl, queryString] = location.href.split("?");

            if (queryString) {
                // Remove the query string to prevent accidentally re-instantiating chaincode.
                history.pushState(null, "", baseUrl);
                window.close();
            }

            maybeDiv.appendChild(getImage(component));
        }
    }
}

// Initial entry point invoked by loader.
export async function instantiate(): Promise<IChaincode> {
    return new Chaincode();
}

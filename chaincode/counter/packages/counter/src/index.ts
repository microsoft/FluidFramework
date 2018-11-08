import { IMap, IMapView, MapExtension } from "@prague/map";
import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import { Component, Store } from "@prague/store";

export class Clicker extends Component {
    constructor() {
        // Register the collaborative types used by this document/component.
        super([[MapExtension.Type, new MapExtension()]]);
    }

    // Initialize the document/component (only called when document is initially created).
    protected async create(runtime: IRuntime, platform: IPlatform, root: IMap) {
        root.set("clicks", 0);
    }

    // Once document/component is opened, finish any remaining initialization required before the
    // document/component is returned to to the host.
    public async opened(runtime: IRuntime, platform: IPlatform, root: IMapView) {
        // If the host provided a <div>, display a minimual UI.
        const maybeDiv = await platform.queryInterface<HTMLElement>("div");        
        if (maybeDiv) {
            // Create a <span> that displays the current value of 'clicks'.
            const span = document.createElement("span");           
            const update = () => { span.textContent = root.get("clicks"); }
            root.getMap().on("valueChanged", update);
            update();
            
            // Create a button that increments the value of 'clicks' when pressed.
            const btn = document.createElement("button");
            btn.textContent = "+";
            btn.addEventListener("click", () => {
                const clicks = root.get("clicks");
                root.set("clicks", clicks + 1);
            });

            // Add both to the <div> provided by the host:
            maybeDiv.appendChild(span);
            maybeDiv.appendChild(btn);
        }
    }
}

// Example chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
    return Store.instantiate(new Clicker());
}

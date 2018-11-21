import { IMap, IMapView, MapExtension } from "@prague/map";
import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import { Component, Store } from "@prague/store";
import { FrameLoader } from "./frameLoader";

export class DOMStreamViewer extends Component {
    constructor() {
        // Register the collaborative types used by this document/component.
        super([[MapExtension.Type, new MapExtension()]]);
    }

    // Once document/component is opened, finish any remaining initialization required before the
    // document/component is returned to to the host.
    public async opened(runtime: IRuntime, platform: IPlatform, rootView: IMapView) {
        // If the host provided a <div>, display a minimual UI.
        const maybeDiv = await platform.queryInterface<HTMLElement>("div");
        if (maybeDiv) {
            // Create a <span> that displays the current value of 'clicks'.
            const iframe = document.createElement("iframe") as HTMLIFrameElement;
            FrameLoader.syncRoot(iframe, rootView);
            maybeDiv.appendChild(iframe);
        }
    }

    // Initialize the document/component (only called when document is initially created).
    protected async create(runtime: IRuntime, platform: IPlatform, root: IMap) {
        // Do nothing
    }
}

// Example chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
    return Store.instantiate(new DOMStreamViewer());
}

import { IMapView } from "@prague/map";
import { IChaincode, IPlatform } from "@prague/runtime-definitions";
import { Chaincode } from "./chaincode";
import { Document } from "./document";

const html = `
<div>
    <p>
        <form class="form-inline">
            <div class="form-group">
                <label for="insertText">URL</label>
                <input name="insertText" type="text" class="form-control">
            </div>
            <button type="submit" class="btn btn-default">Insert</button>
        </form>
    </p>
</div>
`;

enum Mode {
    Edit,
    View,
}

class Runner {
    public async run(collabDoc: Document, platform: IPlatform) {
        const hostContent: HTMLElement = platform ? platform.queryInterface<HTMLElement>("div") : null;
        if (!hostContent) {
            // If headless exist early
            return;
        }

        const content = document.createElement("div");
        hostContent.appendChild(content);

        // access the root document
        const rootView = await collabDoc.getRoot().getView();
        const text = rootView.get("url");

        const mode = await this.getMode(collabDoc, rootView);
        if (mode === Mode.View) {
            this.loadUrl(content, rootView, text);
            return;
        }

        // Add in the setup UI
        content.innerHTML = html;

        const form = content.querySelector("form");
        form.onsubmit = (event) => {
            const url = (form.elements.namedItem("insertText") as HTMLInputElement).value;
            rootView.set("url", url);
            event.preventDefault();
        };

        collabDoc.getRoot().on(
            "valueChanged",
            (changed) => {
                if (changed.key !== "url") {
                    return;
                }

                this.loadUrl(content, rootView, text);
            });
    }

    private loadUrl(content: HTMLElement, view: IMapView, url: string) {
        content.innerHTML = "";
        const iframe = document.createElement("iframe");
        iframe.src = view.get("url");
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        content.appendChild(iframe);
    }

    private async getMode(collabDoc: Document, view: IMapView): Promise<Mode> {
        if (view.has("url")) {
            return Mode.View;
        }

        // TODO need to fix bug with missing initial connection state
        if (collabDoc.runtime.connected === undefined || collabDoc.runtime.connected) {
            return Mode.Edit;
        }

        await new Promise<void>((resolve) => collabDoc.once("connected", () => resolve()));
        return view.has("url") ? Mode.View : Mode.Edit;
    }
}

export async function instantiate(): Promise<IChaincode> {
    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const chaincode = new Chaincode(new Runner());
    return chaincode;
}

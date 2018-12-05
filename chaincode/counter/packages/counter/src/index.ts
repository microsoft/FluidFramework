import { IChaincode } from "@prague/runtime-definitions";
import { Document, DataStore } from "@prague/datastore";

export class Clicker extends Document {
    // Initialize the document/component (only called when document is initially created).
    protected async create() {
        this.root.set("clicks", 0);
    }

    // Once document/component is opened, finish any remaining initialization required before the
    // document/component is returned to to the host.
    public async opened() {
        // If the host provided a <div>, display a minimual UI.
        const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");        
        if (maybeDiv) {
            const rootView = await this.root.getView();

            // Create a <span> that displays the current value of 'clicks'.
            const span = document.createElement("span");           
            const update = () => { span.textContent = rootView.get("clicks"); }
            rootView.getMap().on("valueChanged", update);
            update();
            
            // Create a button that increments the value of 'clicks' when pressed.
            const btn = document.createElement("button");
            btn.textContent = "+";
            btn.addEventListener("click", () => {
                const clicks = rootView.get("clicks");
                this.root.set("clicks", clicks + 1);
            });

            // Add both to the <div> provided by the host:
            maybeDiv.appendChild(span);
            maybeDiv.appendChild(btn);
        }
    }
}

// Example chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
    return DataStore.instantiate(new Clicker());
}

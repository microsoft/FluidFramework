import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { Chaincode } from "./chaincode";
import { Document } from "./document";

class SimplePlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string): Promise<T> {
        return null;
    }
}

class Runner {
    public async run(runtime: IRuntime, platform: IPlatform): Promise<IPlatform> {
        this.start(runtime, platform).catch((error) => console.error(error));
        return new SimplePlatform();
    }

    private async start(runtime: IRuntime, platform: IPlatform): Promise<void> {
        const collabDoc = await Document.load(runtime);
        const root = await collabDoc.getRoot().getView();

        const hostContent: HTMLElement = await platform.queryInterface<HTMLElement>("div");
        if (hostContent) {
            // Create a <span> that displays the current value of 'clicks'.
            const span = document.createElement("span");
            const update = () => { span.textContent = root.get("clicks"); };
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
            hostContent.appendChild(span);
            hostContent.appendChild(btn);
        }
    }
}

export async function instantiate(): Promise<IChaincode> {
    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const chaincode = new Chaincode(new Runner());
    return chaincode;
}

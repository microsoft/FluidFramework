import { Component, Document } from "@prague/app-component";
import { IContainerContext, IRuntime, IPlatform, IRequest, IResponse } from "@prague/container-definitions";
import { IComponent } from "@prague/runtime-definitions";
import { EventEmitter } from "events";

const pkg = require("../package.json");
const chaincodeName = pkg.name;

require("bootstrap/dist/css/bootstrap.min.css");

class SimplePlatform extends EventEmitter implements IPlatform {
    constructor(private div: HTMLDivElement) {
        super();
    }

    public async queryInterface(id: string): Promise<any> {
        if (id === "div") {
            return this.div;
        } else {
            return null;
        }
    }
    
    public detach() {
        throw new Error("Method not implemented.");
    }
}

class ProgressBarView extends EventEmitter implements IPlatform {
    private div: HTMLDivElement;

    constructor(private bar: ProgressBar, parent: HTMLDivElement) {
        super();

        if (parent) {
            this.div = document.createElement("div");
            this.div.classList.add("progress");
            this.div.innerHTML = `
                <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" aria-valuenow="75" aria-valuemin="0" aria-valuemax="100" style="width: 75%"></div>
            `;

            const urlDiv = document.createElement("div");
            urlDiv.innerText = `/progress/${this.bar.id}`

            const downButton = document.createElement("button");
            downButton.innerText = "down";
            downButton.onclick = () => {
                this.bar.changeValue(this.bar.value - 1);
            };

            const upButton = document.createElement("button");
            upButton.innerText = "up";
            upButton.onclick = () => {
                // Should be a counter
                this.bar.changeValue(this.bar.value + 1);
            }

            parent.appendChild(this.div);
            parent.appendChild(urlDiv);
            parent.appendChild(downButton);
            parent.appendChild(upButton);
        }

        this.render();
    }

    public async queryInterface<T>(id: string): Promise<T> {
        return null;
    }
    
    public detach() {
        this.bar.detach(this);
    }

    public render() {
        if (!this.div) {
            return;
        }

        (this.div.firstElementChild as HTMLDivElement).style.width = `${this.bar.value}%`;
    }
}

// The "model" side of a progress bar
export class ProgressBar implements IComponent {
    private views = new Set<ProgressBarView>();

    constructor(public value: number, public id: string, private collection: ProgressCollection) {
    }
    
    // On attach create a specific binding from the model to the platform
    public async attach(platform: IPlatform): Promise<IPlatform> {
        const maybeDiv = await platform.queryInterface<HTMLDivElement>("div");
        const attached = new ProgressBarView(this, maybeDiv);
        this.views.add(attached);

        return attached;
    }

    public changeValue(newValue: number) {
        this.collection.changeValue(this.id, newValue);
    }

    public detach(view: ProgressBarView) {
        this.views.delete(view);
    }

    public update(value: number) {
        this.value = value;

        for (const view of this.views) {
            view.render();
        }
    }
}

export class ProgressCollection extends Document {
    private progressBars = new Map<string, ProgressBar>();

    // TODO you shouldn't need to open this to request into it. it should load the data model and start
    // prior to anyone explicitly attaching to it
    private openedHack = false;

    /**
     * Create the component's schema and perform other initialization tasks
     * (only called when document is initially created).
     */
    protected async create() {
    }

    /**
     * The component has been loaded. Render the component into the provided div
     **/
    public async opened() {
        for (const key of this.root.keys()) {
            this.progressBars.set(key, new ProgressBar(this.root.get(key), key, this));
        }

        this.root.on("valueChanged", (changed) => {
            if (this.progressBars.has(changed.key)) {
                this.progressBars.get(changed.key).update(this.root.get(changed.key));
            } else {
                this.progressBars.set(
                    changed.key,
                    new ProgressBar(this.root.get(changed.key), changed.key, this));
                this.emit("progressAdded", `/${changed.key}`);
            }
        });
    }

    public changeValue(key: string, newValue: number) {
        this.root.set(key, newValue);
    }

    public createProgress(): string {
        const id = `progress-${Date.now()}`;
        this.root.set(id, 50);

        return `/${id}`;
    }

    public getProgress(): string[] {
        return Array.from(this.root.keys()).map((key) => `/${key}`);
    }

    protected async request(request: IRequest): Promise<IResponse> {
        // See TODO on the openedHack declaration for reasoning for the below
        if (!this.openedHack) {
            await this.attach(new SimplePlatform(null));
            this.openedHack = true;
        }

        // TODO the request is not stripping / off the URL
        const trimmed = request.url.substr(1);

        // TODO we need a way to return an observable for a request route (if asked for) to notice updates
        // or at least to request a value >= a sequence number
        await this.root.wait(trimmed);

        return {
            status: 200,
            mimeType: "prague/component",
            value: this.progressBars.get(trimmed),
        };
    }
}

export class ProgressManager extends Document {
    /**
     * Create the component's schema and perform other initialization tasks
     * (only called when document is initially created).
     */
    protected async create() {
        // ProgressManager orchestrates other base component types in the document
        // as such it creates the progress bar collection and names it 'progress'
        await this.runtime.createAndAttachComponent("progress", `${chaincodeName}/progressCollection`);
    }

    public async opened() {
        const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
        if (!maybeDiv) {
            return;
        }

        // TODO - components need to be aware of their full URL so we can do requests against the base runtime
        // as a workaround we get access to the runtime
        // A full URL in this case is just the part that goes to the container - i.e. does not contain the domain
        // or orderer URL (although it could).
        const progressRuntime = await this.runtime.getComponentRuntime("progress", true);
        const progressCollection = await this.runtime.openComponent<ProgressCollection>("progress", true);

        // Create the add button to make new progress bars
        const button = document.createElement("button");
        button.classList.add("btn", "btn-primary");
        button.innerText = "Add!";
        maybeDiv.appendChild(button);

        // Helper function to attach to a progress bar via its URL
        // The expecation is that we store the component URL locally in a map, property bag, etc...
        // Creation would likely come by convention either via a POST like URL or via an attach w/ a custom QI
        // property
        async function addProgress(url: string) {
            const childDiv = document.createElement("div");
            maybeDiv.appendChild(childDiv);

            const progressbar = await progressRuntime.request({ url });
            (progressbar.value as IComponent).attach(new SimplePlatform(childDiv));
        }

        // Render all existing progress bars
        progressCollection.getProgress().map((progress) => {
            console.log(progress);
            addProgress(progress);
        })

        // Listen for updates and then render any new progress bar
        progressCollection.on("progressAdded", (id) => {
            console.log("progressAdded", id);
            addProgress(id);
        });

        // On click create and add a new progress bar
        button.onclick = () => {
            const progress = progressCollection.createProgress();
            console.log(progress);
        }
    }
}

export async function instantiateRuntime(
    context: IContainerContext
): Promise<IRuntime> {
    return Component.instantiateRuntime(context, chaincodeName, new Map([
        // We register two components at the container level - the progress collection as well as the progress
        // manager
        [chaincodeName, Promise.resolve(Component.createComponentFactory(ProgressManager))],
        [`${chaincodeName}/progressCollection`, Promise.resolve(Component.createComponentFactory(ProgressCollection))]
    ]));
}

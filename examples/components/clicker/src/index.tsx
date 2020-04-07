/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable prefer-arrow/prefer-arrow-functions */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { Counter, CounterValueType } from "@microsoft/fluid-map";
import { ITask } from "@microsoft/fluid-runtime-definitions";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { ClickerAgent } from "./agent";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ClickerName = pkg.name as string;

const anchorName: string = "AnchorAttributes";
const anchorId: string = "anchor";

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends PrimedComponent implements IComponentHTMLView {
    private anchor: ILastEdited | undefined;
    public get IComponentHTMLView() { return this; }

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        this.root.createValueType("clicks", CounterValueType.Name, 0);
        if (!this.runtime.connected) {
            await new Promise<void>((resolve) => this.runtime.on("connected", () => resolve()));
        }
        this.setupAgent();
    }

    protected async componentInitializingFromExisting() {
        this.setupAgent();
    }

    protected async componentHasInitialized() {
        const response = await this.context.hostRuntime.request({ url: anchorId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            return;
        }

        this.anchor = response.value as ILastEdited;
        this.context.hostRuntime.on("op", (message) => {
            if (message.type === "op") {
                this.showLastEdited();
            }
        });
    }

    // #region IComponentHTMLView

    private showLastEdited() {
        const myDiv = document.getElementById("my-id");
        if (myDiv && this.context.clientId) {
            const me = this.context.getQuorum().getMember(this.context.clientId);
            const user = me?.client.user;
            myDiv.innerText = `My Identity: ${user?.id}`;
        }

        const lastEditDetails = this.anchor?.getLastEditDetails();
        if (lastEditDetails) {
            const date = new Date(lastEditDetails.timestamp);
            const editedDiv = document.getElementById("user-div");
            if (editedDiv) {
                editedDiv.innerText =
                    `Last Edited - User: ${lastEditDetails.user.id}. Time: ${JSON.stringify(date.toUTCString())}`;
            }
        }
    }

    /**
     * Will return a new Clicker view
     */
    public render(div: HTMLElement) {
    // Get our counter object that we set in initialize and pass it in to the view.
        const counter = this.root.get("clicks");
        ReactDOM.render(
            <CounterReactView counter={counter} />,
            div,
        );

        let user;
        if (this.context.clientId) {
            const me = this.context.getQuorum().getMember(this.context.clientId);
            user = me?.client.user;
        }

        const lastEditDetails = this.anchor?.getLastEditDetails();
        const date = lastEditDetails ? new Date(lastEditDetails.timestamp) : undefined;
        const html = `
        <div>
            <br />
            <br />
            <span id="my-id">
                My Identity: ${JSON.stringify(user?.id)}
            </span>
            <br />
            <br />
            <span id="user-div">
                Last Edited: User: ${lastEditDetails?.user.id}. Time: ${JSON.stringify(date?.toUTCString())}
            </span>
            <br />
            <br />
        </div>
        `;

        const userDiv = document.createElement("div");
        userDiv.innerHTML = html;
        div.appendChild(userDiv);
        return div;
    }

    // #endregion IComponentHTMLView

    public setupAgent() {
        const counter: Counter = this.root.get("clicks");
        const agentTask: ITask = {
            id: "agent",
            instance: new ClickerAgent(counter),
        };
        this.taskManager.register(agentTask);
        this.taskManager.pick(this.url, "agent", true).then(() => {
            console.log(`Picked`);
        }, (err) => {
            console.log(err);
        });
    }
}

// ----- REACT STUFF -----

interface CounterProps {
    counter: Counter;
}

interface CounterState {
    value: number;
}

class CounterReactView extends React.Component<CounterProps, CounterState> {
    constructor(props: CounterProps) {
        super(props);

        this.state = {
            value: this.props.counter.value,
        };
    }

    componentDidMount() {
        this.props.counter.on("incremented", (incrementValue: number, currentValue: number) => {
            this.setState({ value: currentValue });
        });
    }

    render() {
        return (
            <div>
                <span className="clicker-value-class" id={`clicker-value-${Date.now().toString()}`}>
                    {this.state.value}
                </span>
                <button onClick={() => { this.props.counter.increment(1); }}>+</button>
            </div>
        );
    }
}

// ----- FACTORY SETUP -----

export const ClickerInstantiationFactory = new PrimedComponentFactory(
    ClickerName,
    Clicker,
    [],
);

class ClickerFactory implements IRuntimeFactory {
    public get IRuntimeFactory() { return this; }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const registry = new Map<string, Promise<IComponentFactory>>([
            [ClickerName, Promise.resolve(ClickerInstantiationFactory)],
        ]);

        registry.set(anchorName, Promise.resolve(AqueductAnchor.getFactory()));

        const defaultComponentId = "default";

        const runtime = await ContainerRuntime.load(
            context,
            registry,
            [async (request: IRequest, containerRuntime: IHostRuntime) => {
                console.log(`Request for: ${request.url}`);

                const requestUrl = request.url.length > 0 && request.url.startsWith("/")
                    ? request.url.substr(1)
                    : request.url;
                const trailingSlash = requestUrl.indexOf("/");

                const componentId = requestUrl
                    ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
                    : defaultComponentId;
                const component = await containerRuntime.getComponentRuntime(componentId, true);

                return component.request({ url: trailingSlash === -1 ? "" : requestUrl.substr(trailingSlash + 1) });
            }],
            { generateSummaries: true });

        // On first boot create the base component
        if (!runtime.existing) {
            await runtime.createComponent(anchorId, anchorName).then((componentRuntime) => {
                componentRuntime.attach();
            }).catch((error) => {
                context.error(error);
            });

            await runtime.createComponent(defaultComponentId, ClickerName).then((componentRuntime) => {
                componentRuntime.attach();
            }).catch((error) => {
                context.error(error);
            });
        }

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.setupAnchorComponent(runtime);

        return runtime;
    }

    /**
     * Sets up the anchor component which tracks the last edit details to the Container.
     * @param runtime - The ContainerRuntime.
     */
    private async setupAnchorComponent(runtime: ContainerRuntime) {
        try {
            // eslint-disable-next-line prefer-const
            let anchor: AqueductAnchor;
            const messages: ISequencedDocumentMessage[] = [];

            // Queue ops until the anchor component is loaded and then pass the queued ops to it.
            // If the anchor component is loaded, pass incoming op to it directly.
            runtime.on("op", (message: ISequencedDocumentMessage) => {
                if (message.type === MessageType.Operation) {
                    const envelope = message.contents as IEnvelope;
                    // Filter out scheduler ops.
                    if (!envelope.address.includes("_scheduler")) {
                        if (anchor !== undefined) {
                            anchor.message = message;
                        } else {
                            messages.push(message);
                        }
                    }
                }
            });

            const anchorRuntime = await runtime.getComponentRuntime(anchorId, true);
            const response = await anchorRuntime.request({ url: "/" });

            if (response.status !== 200 || response.mimeType !== "fluid/component") {
                throw new Error("Could not find metadata component");
            }

            anchor = response.value;
            // Pass the queued ops to the anchor component now that it's loaded.
            messages.forEach((message: ISequencedDocumentMessage) => {
                anchor.message = message;
            });
        } catch (error) {
            console.log(`Error: ${JSON.stringify(error)}`);
        }
    }
}

export const fluidExport = new ClickerFactory();

// eslint-disable-next-line @typescript-eslint/promise-function-async
export function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return fluidExport.instantiateRuntime(context);
}

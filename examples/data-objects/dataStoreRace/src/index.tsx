/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle, IFluidLoadable, IFluidRouter, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import {
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
 } from "@fluidframework/runtime-definitions";
import { IFluidHTMLOptions, IFluidHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";
import { FluidDataStoreRuntime, FluidObjectHandle, ISharedObjectRegistry } from "@fluidframework/datastore";
import { SharedMap } from "@fluidframework/map";
import {
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IRuntimeFactory, IContainerContext } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { RequestParser } from "@fluidframework/runtime-utils";

const counterKey = "counter";

export class MergeableClicker implements IFluidHTMLView, IFluidRouter, IFluidLoadable {
    public static async load(runtime: FluidDataStoreRuntime) {
        const ds = new MergeableClicker(runtime);
        if (runtime.existing === false) {
            await ds.initializingFirstTime();
        }
        await ds.hasInitialized();
        return ds;
    }

    public get IFluidHTMLView() { return this; }
    public get IFluidRouter() { return this; }
    public get IFluidLoadable() { return this; }

    public readonly handle: IFluidHandle<this>;

    private root!: SharedMap;
    private _counter: SharedCounter | undefined;

    private constructor(private readonly runtime: FluidDataStoreRuntime) {
        this.handle = new FluidObjectHandle(this, "", runtime.objectsRoutingContext);
    }
    async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/object",
            status: 200,
            value: this,
        };
    }

    public async initializingFirstTime() {
        const root = SharedMap.create(this.runtime, "root");
        const counter = SharedCounter.create(this.runtime);
        root.set(counterKey, counter.handle);
        root.bindToContext();
    }

    public async hasInitialized() {
        this.root = await this.runtime.getChannel("root") as unknown as SharedMap;
        const counterHandle = this.root.get<IFluidHandle<SharedCounter>>(counterKey);
        this._counter = await counterHandle.get();
        console.log(`counter ${this._counter?.value}`);
    }

    public render(div: HTMLElement) {
        // Get our counter object that we set in initialize and pass it in to the view.
        ReactDOM.render(
            <CounterReactView counter={this.counter} />,
            div,
        );
        return div;
    }

    private get counter() {
        if (this._counter === undefined) {
            throw new Error("SharedCounter not initialized");
        }
        return this._counter;
    }

    public merge(target: this) {
        target.counter.increment(this.counter.value);
}

    public dispose() {
        this.runtime.dispose();
    }

    public snapshot() {
        return this.runtime.getAttachSnapshot();
    }
}

// ----- REACT STUFF -----

interface CounterProps {
    counter: SharedCounter;
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

const MerableClickerInstantiationFactory:
    IFluidDataStoreFactory &
    {
        createLocal: (containerRuntime: ContainerRuntime)
             => Promise<MergeableClicker>,
    } = {
    type: "MergableClicker",
    get IFluidDataStoreFactory() {return this;},
    instantiateDataStore: async (context: IFluidDataStoreContext) => {
        const facts: IChannelFactory[] = [
            SharedMap.getFactory(),
            SharedCounter.getFactory(),
        ];
        const reg: ISharedObjectRegistry =
            new Map<string, IChannelFactory | undefined>(facts.map((ext) => [ext.type, ext]));

        const dsRuntime = FluidDataStoreRuntime.load(
            context,
            reg);

        // cannot await this as we get in infinite loop of realization due to handle resolution
        //
        const clickerP = MergeableClicker.load(dsRuntime);

        dsRuntime.registerRequestHandler(async (req) => (await clickerP).request(req));

        return dsRuntime;
    },
    createLocal: async (containerRuntime: ContainerRuntime) => {
        const loader = Loader._create(
            [],
            [],
            { load: async () => ({ fluidExport: NormalContainerFactory }) },
            {},
            { },
            new Map(),
        );
        const container = await loader.createDetachedContainer(containerRuntime.codeDetails);
        const res = await container.request({ url: "" });
        return res.value as MergeableClicker;
    },
};

export const NormalContainerFactory: IRuntimeFactory =  {
    get IRuntimeFactory() {return this;},
    instantiateRuntime: async (context: IContainerContext)=>{
        const runtime: ContainerRuntime =  await ContainerRuntime.load(
            context,
            [["default", Promise.resolve(MerableClickerInstantiationFactory)]],
            async (req)=>{
                const rp = RequestParser.create(req);
                const ds =  await runtime.getRootDataStore(rp.pathParts[0] ?? "default", true);
                return ds.request(rp.pathParts.length > 1 ? rp.createSubRequest(1) : { url: "" });
            },
            {
                enableSummarizerNode: false,
                generateSummaries: false,
            });

        if (runtime.existing === false) {
            await runtime.createRootDataStore("default", "default");
        }

        return runtime;
    },
};

export const RaceContainerFactory: IRuntimeFactory = {
    get IRuntimeFactory() {return this;},
    instantiateRuntime: async (context: IContainerContext)=>{
        let current: MergeableClicker;
        let lastElm: HTMLElement;
        const viewProxy: IFluidHTMLView = {
            get IFluidHTMLView() {return this;},
            render(elm: HTMLElement, options?: IFluidHTMLOptions) {
                lastElm = elm;
                current.render(elm);
            },
        };

        const runtime =  await ContainerRuntime.load(
            context,
            [["default", Promise.resolve(MerableClickerInstantiationFactory)]],
            async (req)=> {
                return  { status: 200, mimeType: "fluid/object", value: viewProxy };
            });

        const local = current = await MerableClickerInstantiationFactory.createLocal(runtime);

        runtime.once("connected", ()=>{
            runtime.once("dataStoreRaceResolved", (id, channel)=>{
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                channel.request({ url:"" }).then(async (req)=>{
                    const realClicker = req.value as MergeableClicker;
                    current = realClicker;
                    ReactDOM.unmountComponentAtNode(lastElm);
                    local.merge(realClicker);
                    viewProxy.render(lastElm);
                    local.dispose();
                });
            });

            const snapshot = local.snapshot();
            // eslint-disable-next-line no-null/no-null
            runtime.raceDataStore("default", { entries: snapshot, id: null }, "default");
        });

        return runtime;
    },
};

export const fluidExport = RaceContainerFactory;

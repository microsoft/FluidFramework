import { IChaincode } from "@prague/runtime-definitions";
import { Component, Document } from "@prague/app-component";
import { Counter, CounterValueType } from "@prague/map";

export class Clicker extends Document {
    // Initialize the document/component (only called when document is initially created).
    protected async create() {
        this.root.set<Counter>("clicks", 0, CounterValueType.Name);
    }

    // Once document/component is opened, finish any remaining initialization required before the
    // document/component is returned to to the host.
    public async opened() {
        const counter = await this.root.wait<Counter>("clicks");

        const interval = this.runtime.existing ? 1000 : 10000;
        console.log(`Interval of ${interval}`);
        setInterval(
            () => {
                console.log(`Increment ${this.runtime.clientId}`);
                counter.increment(1)
            },
            interval);

        counter.onIncrement = () => { console.log(`Counter === ${counter.value}`) };
    }
}

// Example chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
    return Component.instantiate(new Clicker());
}

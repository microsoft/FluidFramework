import { IChaincode } from "@prague/runtime-definitions";
import { Document, DataStore } from "@prague/datastore";
import { Counter, CounterValueType } from "@prague/map";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import GraphiQL from 'graphiql';

require("../node_modules/graphiql/graphiql.css");

export class Graphiql extends Document {
    // Initialize the document/component (only called when document is initially created).
    protected async create() {
        this.root.set<Counter>("clicks", 0, CounterValueType.Name);
    }

    // Once document/component is opened, finish any remaining initialization required before the
    // document/component is returned to to the host.
    public async opened() {
        // If the host provided a <div>, display a minimual UI.
        const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");        
        if (maybeDiv) {
            // const counter = await this.root.wait<Counter>("clicks");

            // // Create a <span> that displays the current value of 'clicks'.
            // const span = document.createElement("span");           
            // const update = () => { span.textContent = counter.value.toString(); }
            // this.root.on("valueChanged", update);
            // update();
            
            // // Create a button that increments the value of 'clicks' when pressed.
            // const btn = document.createElement("button");
            // btn.textContent = "+";
            // btn.addEventListener("click", () => {
            //     counter.increment(1);
            // });

            // // Add both to the <div> provided by the host:
            // maybeDiv.appendChild(span);
            // maybeDiv.appendChild(btn);

            // const props = {
            //     schema: "schema",
            //     query: "default query",
            // }
            ReactDOM.render( React.createElement(GraphiQL, {} ),  maybeDiv);

            // maybeDiv.appendChild(GraphiQL)
        }
    }
}

// Example chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
    return DataStore.instantiate(new Graphiql());
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { PrimedComponentFactory, } from "@fluidframework/aqueduct";
import { useStateFluid, SyncedComponent, } from "@fluidframework/react";
import * as React from "react";
import * as ReactDOM from "react-dom";
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ClickerFunctionalName = pkg.name;
function CounterReactFunctional(props) {
    const [state, setState] = useStateFluid(props, { value: 0 });
    return (React.createElement("div", null,
        React.createElement("span", { className: "value" }, state.value),
        React.createElement("button", { onClick: () => {
                setState(Object.assign(Object.assign({}, state), { value: state.value + 1 }));
            } }, "+")));
}
/**
 * Basic ClickerFunctional example showing Clicker as a React Functional component
 */
export class ClickerFunctional extends SyncedComponent {
    constructor(props) {
        super(props);
        this.setConfig("counter-functional", {
            syncedStateId: "counter-functional",
            fluidToView: new Map([
                [
                    "value", {
                        type: "number",
                        viewKey: "value",
                    },
                ],
            ]),
            defaultViewState: { value: 0 },
        });
    }
    /**
     * Will return a new ClickerFunctional view
     */
    render(div) {
        ReactDOM.render(React.createElement("div", null,
            React.createElement(CounterReactFunctional, { syncedStateId: "counter-functional", syncedComponent: this })), div);
        return div;
    }
}
// ----- FACTORY SETUP -----
export const ClickerFunctionalInstantiationFactory = new PrimedComponentFactory(ClickerFunctionalName, ClickerFunctional, [], {});
export const fluidExport = ClickerFunctionalInstantiationFactory;
//# sourceMappingURL=index.js.map
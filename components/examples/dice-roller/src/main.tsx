/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    FluidToViewMap,
    IFluidProps,
    useStateFluid,
} from "@fluidframework/aqueduct-react";
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";

interface IDiceRollerState { value: number }
interface IDiceRollerViewState extends IFluidFunctionalComponentViewState, IDiceRollerState { }
interface IDiceRollerFluidState extends IFluidFunctionalComponentFluidState, IDiceRollerState { }
function DiceRollerView(
    props: IFluidProps<
        IDiceRollerViewState,
        IDiceRollerFluidState
    >,
) {
    const [state, setState] = useStateFluid<
        IDiceRollerViewState,
        IDiceRollerFluidState
    >(props, { value: 1 });
    const roll = () => setState({ value: Math.floor(Math.random() * 6) + 1 });
    const diceChar = String.fromCodePoint(0x267F + state.value);
    return (
        <div>
            <span style={{ fontSize: 50 }}>{diceChar}</span>
            <button onClick={roll}>Roll</button>
        </div>
    );
}
export class DiceRoller extends PrimedComponent implements IComponentHTMLView {
    public static get ComponentName() { return "@fluid-example/dice-roller"; }
    public get IComponentHTMLView() { return this; }
    public render(div: HTMLElement) {
        const functionalFluidToView: FluidToViewMap<IDiceRollerViewState, IDiceRollerFluidState> = new Map();
        functionalFluidToView.set("value", { viewConverter: (syncedState) => syncedState });
        ReactDOM.render(
            <DiceRollerView
                syncedStateId={"dice-roller"}
                root={this.root}
                dataProps={{
                    fluidComponentMap: new Map(),
                    runtime: this.runtime,
                }}
                fluidToView={functionalFluidToView}
            />,
            div,
        );
    }
}
export const DiceRollerInstantiationFactory = new PrimedComponentFactory(
    DiceRoller.ComponentName,
    DiceRoller,
    [],
    {},
);

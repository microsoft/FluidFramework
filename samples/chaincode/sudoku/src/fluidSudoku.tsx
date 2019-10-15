/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentReactViewable } from "@microsoft/fluid-aqueduct-react";
import { IComponentHandle, IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { loadPuzzle } from "./helpers/puzzles";
import { SudokuCell } from "./helpers/sudokuCell";
import { SudokuView } from "./react/sudokuView";

import "./helpers/styles.css";

export const FluidSudokuName = "FluidSudoku";

/**
 * A collaborative Sudoku component built on the Fluid Framework.
 */
export class FluidSudoku extends PrimedComponent implements IComponentHTMLVisual, IComponentReactViewable {
    public get IComponentHTMLVisual() {
        return this;
    }

    public get IComponentReactViewable() {
        return this;
    }

    /**
     * This is where you define all which Distributed Data Structures your component will use
     */
    private static readonly factory = new PrimedComponentFactory(FluidSudoku, [
        SharedMap.getFactory(),
    ]);

    public static getFactory() {
        return this.factory;
    }

    private puzzle: ISharedMap | undefined;

    /**
     * ComponentInitializingFirstTime is where you do setup for your component. This is only called once the first time
     * your component is created. Anything that happens in componentInitializingFirstTime will happen before any other
     * user will see the component.
     */
    protected async componentInitializingFirstTime() {
        const puzzle = SharedMap.create(this.runtime);
        loadPuzzle(0, puzzle);

        this.root.set("puzzle", puzzle.handle);
    }

    /**
     * This method will be called whenever the component has initialized, be it the first time or subsequent times.
     */
    protected async componentHasInitialized() {
        // Shared objects that are stored within other Shared objects (e.g. a SharedMap within the root, which is a
        // SharedDirectory) must be retrieved asynchronously. We do that here, in this async function, then store a
        // local reference to the object so we can easily use it in synchronous code.
        //
        // Our "puzzle" SharedMap is stored as a handle on the "root" SharedDirectory. To get it we must make a
        // synchronous call to get the IComponentHandle, then an asynchronous call to get the ISharedMap from the
        // handle.
        this.puzzle = await this.root
            .get<IComponentHandle>("puzzle")
            .get<ISharedMap>();
    }

    public createJSXElement(props?): JSX.Element {
        if (this.puzzle) {
            return <SudokuView puzzle={this.puzzle} />;
        } else {
            return <div />;
        }
    }

    /**
     * This method is called automatically by the Fluid runtime.
     */
    public render(div: HTMLElement) {
        const rerender = () => {
            console.log("rerender!");
            if (this.puzzle) {
                ReactDOM.render(this.createJSXElement(), div);
            }
        };

        rerender();

        if (this.puzzle) {
            this.puzzle.on("valueChanged", (changed, local, op) => {
                const prev = changed.previousValue as SudokuCell;
                console.log(`local: ${local} | op: ${JSON.stringify(op)}`);
                if (this.puzzle) {
                    console.log(`${local ? "Local" : "Remote"} valueChanged: ${changed.key} ==> ${
                        JSON.stringify(this.puzzle.get<SudokuCell>(changed.key))} :: was ${
                        JSON.stringify(prev)})`);
                    rerender();
                }
            });
        }
    }
}

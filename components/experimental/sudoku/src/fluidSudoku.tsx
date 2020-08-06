/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";
import { loadPuzzle } from "./helpers/puzzles";
import { SudokuView } from "./react/sudokuView";

// eslint-disable-next-line import/no-unassigned-import
import "./helpers/styles.css";

export const FluidSudokuName = "FluidSudoku";

/**
 * A collaborative Sudoku component built on the Fluid Framework.
 */
export class FluidSudoku extends DataObject implements IFluidHTMLView {
    public get IFluidHTMLView() {
        return this;
    }

    /**
     * This is where you define all which Distributed Data Structures your component will use
     */
    private static readonly factory = new DataObjectFactory(
        FluidSudokuName,
        FluidSudoku,
        [SharedMap.getFactory()],
        {}
    );

    public static getFactory() {
        return FluidSudoku.factory;
    }

    private domElement: HTMLElement | undefined;
    private readonly sudokuMapKey = "sudoku-map";
    private puzzle: ISharedMap | undefined;
    private readonly presenceMapKey = "clientPresence";
    private clientPresence: ISharedMap | undefined;

    /**
     * ComponentInitializingFirstTime is where you do setup for your component. This is only called once the first time
     * your component is created. Anything that happens in initializingFirstTime will happen before any other
     * user will see the component.
     */
    protected async initializingFirstTime() {
        // Create a new map for our Sudoku data
        const map = SharedMap.create(this.runtime);

        // Populate it with some puzzle data
        loadPuzzle(0, map);

        // Store the new map under the sudokuMapKey key in the root SharedDirectory
        this.root.set(this.sudokuMapKey, map.handle);

        // Create a SharedMap to store presence data
        const clientPresence = SharedMap.create(this.runtime);
        this.root.set(this.presenceMapKey, clientPresence.handle);
    }

    /**
     * This method will be called whenever the component has initialized, be it the first time or subsequent times.
     */
    protected async hasInitialized() {
        // Shared objects that are stored within other Shared objects (e.g. a SharedMap within the root, which is a
        // SharedDirectory) must be retrieved asynchronously. We do that here, in this async function, then store a
        // local reference to the object so we can easily use it in synchronous code.
        //
        // Our "puzzle" SharedMap is stored as a handle on the "root" SharedDirectory. To get it we must make a
        // synchronous call to get the IFluidHandle, then an asynchronous call to get the ISharedMap from the
        // handle.
        this.puzzle = await this.root.get<IFluidHandle<ISharedMap>>(this.sudokuMapKey).get();

        // Since we're using a Fluid distributed data structure to store our Sudoku data, we need to render whenever a
        // value in our map changes. Recall that distributed data structures can be changed by both local and remote
        // clients, so if we don't call render here, then our UI will not update when remote clients change data.
        this.puzzle.on("valueChanged", (changed, local, op) => {
            this.render();
        });

        this.clientPresence = await this.root
            .get<IFluidHandle<ISharedMap>>(this.presenceMapKey)
            .get();

        this.clientPresence.on("valueChanged", (changed, local, op) => {
            this.render();
        });
    }

    public render(element?: HTMLElement): void {
        if (element) {
            this.domElement = element;
        }
        if (this.domElement) {
            let view: JSX.Element;
            if (this.puzzle) {
                view = (
                    <SudokuView
                        puzzle={this.puzzle}
                        clientPresence={this.clientPresence}
                        clientId={this.runtime.clientId ?? "not connected"}
                        setPresence={this.presenceSetter}
                    />
                );
            } else {
                view = <div />;
            }
            ReactDOM.render(view, this.domElement);
        }
    }

    /**
     * A function that can be used to update presence data.
     *
     * @param cellCoordinate - The coordinate of the cell to set.
     * @param reset - If true, presence for the cell will be cleared.
     */
    private readonly presenceSetter = (cellCoordinate: string, reset: boolean): void => {
        if (this.clientPresence) {
            if (reset) {
                // Retrieve the current clientId in the cell, if there is one
                const prev = this.clientPresence.get<string>(cellCoordinate);
                const isCurrentClient = this.runtime.clientId === prev;
                if (!isCurrentClient) {
                    return;
                }
                this.clientPresence.delete(cellCoordinate);
            } else {
                this.clientPresence.set(cellCoordinate, this.runtime.clientId);
            }
        }
    };
}

import * as React from 'react';
import * as ReactDOM from "react-dom";
import { BaseMFxPart } from "@ms/mfx-part-base";
import { SharedMap, ISharedMap } from '@microsoft/fluid-map';
import { loadPuzzle } from './helpers/puzzles';
import { SudokuView } from './view/sudokuView';

import "./helpers/styles.css";

export class SudokuWebPart extends BaseMFxPart<{}> {
    private sudokuMapKey = "sudoku-map";
    private puzzle: ISharedMap;

    public render(): void {
        ReactDOM.render(
            <SudokuView puzzle={this.puzzle} />,
            this.domElement);
    }

    public async onInitializeFirstTime() {
        // Create a new map for our Sudoku data
        const map = SharedMap.create(this._fluidShim.runtime, this.sudokuMapKey);

        // Populate it with some puzzle data
        loadPuzzle(0, map);

        // Register the map with the Fluid runtime
        map.register();
    }

    public async onInit() {
        // Retrieve the distributed data structure (also called a channel in this context)
        this.puzzle = await this._fluidShim.runtime.getChannel(this.sudokuMapKey) as ISharedMap;

        // Since we're using a Fluid distributed data structure to store our Sudoku data, we need to render whenever a value
        // in our map changes. Recall that distributed data structures can be changed by both local and remote clients, so
        // if we don't call render here, then our UI will not update when remote clients change data.
        this.puzzle.on("valueChanged", (changed, local, op) => {
            this.render();
        });
    }
}

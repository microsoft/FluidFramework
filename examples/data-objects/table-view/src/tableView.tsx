/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHTMLOptions, IFluidHTMLView } from "@fluidframework/view-interfaces";
import React, { useEffect, useRef } from "react";
import { GridView } from "./grid";
import * as styles from "./index.css";
import { TableModel } from "./tableModel";

interface ITableViewProps {
    model: TableModel;
}

export const TableViewReact: React.FC<ITableViewProps> = (props: ITableViewProps) => {
    const { model } = props;

    const formulaInputRef = useRef<HTMLInputElement>(null);
    const selectionSummarySpanRef = useRef<HTMLSpanElement>(null);
    const goToInputRef = useRef<HTMLInputElement>(null);
    const gridRootRef = useRef<HTMLDivElement>(null);
    const gridView = useRef<GridView>();

    const getFormula = () => formulaInputRef.current?.value ?? "";
    const setFormula = (val: string) => {
        if (formulaInputRef.current !== null) {
            formulaInputRef.current.value = val;
        }
    };
    const setSelectionSummary = (val: string) => {
        if (selectionSummarySpanRef.current !== null) {
            selectionSummarySpanRef.current.textContent = val;
        }
    };

    useEffect(() => {
        gridView.current = new GridView(
            model.tableMatrix,
            getFormula,
            setFormula,
            setSelectionSummary,
        );
        if (gridRootRef.current !== null) {
            while (gridRootRef.current.firstChild !== null) {
                gridRootRef.current.removeChild(gridRootRef.current.firstChild);
            }
            gridRootRef.current.append(gridView.current.root);
        }
    }, [model]);

    const executeGoTo = () => {
        if (gridView.current !== undefined && goToInputRef.current !== null) {
            gridView.current.startRow = parseInt(goToInputRef.current.value, 10) - 1;
        }
    };

    return (
        <div>
            <button>R+</button>
            <button>C+</button>
            <button>R++</button>
            <button>C++</button>
            <div>
                <input
                    type="text"
                    ref={ formulaInputRef }
                    onKeyPress={ (e) => { gridView.current?.formulaKeypress(e.nativeEvent); } }
                    onBlur={ () => { gridView.current?.formulaFocusOut(); } }
                    placeholder="Formula input"
                />
                <div ref={ gridRootRef } className={ styles.grid }></div>
                <span ref={ selectionSummarySpanRef }></span>
            </div>
            <input
                type="text"
                ref={ goToInputRef }
                onChange={ executeGoTo }
            />
        </div>
    );
};

export class TableView implements IFluidHTMLView {
    public get IFluidHTMLView() { return this; }

    private templateRoot: HTMLDivElement | undefined;

    private readonly _formulaInput = document.createElement("input");
    public readonly getFormula = () => this._formulaInput.value;
    public readonly setFormula = (val: string) => { this._formulaInput.value = val; };

    private readonly _selectionSummary = document.createElement("span");
    public readonly setSelectionSummary = (val: string) => { this._selectionSummary.textContent = val; };

    public constructor(private readonly tableView: TableModel) { }

    private generateView() {
        const root = document.createElement("div");

        const addRowBtn = document.createElement("button");
        addRowBtn.textContent = "R+";
        addRowBtn.addEventListener("click", () => {
            this.tableView.tableMatrix.insertRows(this.tableView.tableMatrix.rowCount, 1);
        });

        const addColBtn = document.createElement("button");
        addColBtn.textContent = "C+";
        addColBtn.addEventListener("click", () => {
            this.tableView.tableMatrix.insertCols(this.tableView.tableMatrix.colCount, 1);
        });

        const addRowsBtn = document.createElement("button");
        addRowsBtn.textContent = "R++";
        addRowsBtn.addEventListener("click", () => {
            this.tableView.tableMatrix.insertRows(this.tableView.tableMatrix.rowCount, 10 /* 1048576 */);
        });

        const addColsBtn = document.createElement("button");
        addColsBtn.textContent = "C++";
        addColsBtn.addEventListener("click", () => {
            this.tableView.tableMatrix.insertCols(this.tableView.tableMatrix.colCount, 10 /* 16384 */);
        });

        const gridGroup = document.createElement("div");

        this._formulaInput.placeholder = "Formula input";

        const grid = document.createElement("div");
        grid.classList.add(styles.grid);

        const gridView = new GridView(
            this.tableView.tableMatrix,
            this.getFormula,
            this.setFormula,
            this.setSelectionSummary,
        );
        grid.append(gridView.root);

        this._formulaInput.addEventListener("keypress", gridView.formulaKeypress);
        this._formulaInput.addEventListener("focusout", gridView.formulaFocusOut);

        gridGroup.append(this._formulaInput, grid, this._selectionSummary);

        const gotoInput = document.createElement("input");
        gotoInput.addEventListener("change", () => {
            gridView.startRow = parseInt(gotoInput.value, 10) - 1;
        });

        root.append(addRowBtn, addColBtn, addRowsBtn, addColsBtn, gridGroup, gotoInput);

        return root;
    }

    // #region IFluidHTMLView
    public render(elm: HTMLElement, options?: IFluidHTMLOptions): void {
        if (this.templateRoot === undefined) {
            this.templateRoot = this.generateView();
        }
        elm.append(this.templateRoot);
    }
    // #endregion IFluidHTMLView
}

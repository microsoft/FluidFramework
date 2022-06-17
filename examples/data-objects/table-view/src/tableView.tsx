/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useRef } from "react";
import { GridView } from "./grid";
import * as styles from "./index.css";
import { TableModel } from "./tableModel";

interface ITableViewProps {
    model: TableModel;
}

export const TableView: React.FC<ITableViewProps> = (props: ITableViewProps) => {
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
            <button onClick={ () => model.tableMatrix.insertRows(model.tableMatrix.rowCount, 1) }>R+</button>
            <button onClick={ () => model.tableMatrix.insertCols(model.tableMatrix.colCount, 1) }>C+</button>
            <button onClick={ () => model.tableMatrix.insertRows(model.tableMatrix.rowCount, 10) }>R++</button>
            <button onClick={ () => model.tableMatrix.insertCols(model.tableMatrix.colCount, 10) }>C++</button>
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

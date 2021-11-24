/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";

import _ from "lodash";
import {
     IDataCreationOptions,
     IInspectorRow,
     IInspectorTableProps,
     InspectorTable,
     ModalManager,
     ModalRoot,
     fetchRegisteredTemplates,
     handlePropertyDataCreation,
    } from "@fluid-experimental/property-inspector-table";

import { makeStyles } from "@material-ui/styles";
import { MuiThemeProvider } from "@material-ui/core/styles";

import { PropertyProxy } from "@fluid-experimental/property-proxy";

import { DataBinder } from "@fluid-experimental/property-binder";
import { SharedPropertyTree } from "@fluid-experimental/property-dds";
import AutoSizer from "react-virtualized-auto-sizer";

import { theme } from "./theme";

const useStyles = makeStyles({
    activeGraph: {
        "flex-basis": "100%",
        "z-index": 1,
    },
    horizontalContainer: {
        display: "flex",
        flex: "1",
    },
    inspectorContainer: {
        "display": "flex",
        "flex-basis": "100%",
        "padding-left": "1px",
    },
    root: {
        "display": "flex",
        "flex-direction": "column",
        "font-family": "ArtifaktElement, Helvetica, Arial",
        "height": "100%",
        "justify-content": "flex-start",
        "overflow": "hidden",
    },
    sideNavContainer: {
        display: "flex",
    },
    verticalContainer: {
        "display": "flex",
        "flex-basis": "100%",
        "flex-direction": "column",
        "justify-content": "space-between",
    },
    tableContainer: {
        display: "flex",
        height: "100%",
        width: "100%",
    },
}, { name: "InspectorApp" });

export const handleDataCreationOptionGeneration = (rowData: IInspectorRow, nameOnly: boolean): IDataCreationOptions => {
    if (nameOnly) {
        return { name: "property" };
    }
    const templates = fetchRegisteredTemplates();
    return { name: "property", options: templates };
};

const tableProps: Partial<IInspectorTableProps> = {
    columns: ["name", "value", "type"],
    dataCreationHandler: handlePropertyDataCreation,
    dataCreationOptionGenerationHandler: handleDataCreationOptionGeneration,
    expandColumnKey: "name",
    width: 1000,
    height: 600,
};

export const InspectorApp = (props: any) => {
    const classes = useStyles();

    return (
        <MuiThemeProvider theme={theme}>
            <ModalManager>
                <ModalRoot />
                <div className={classes.root}>
                    <div className={classes.horizontalContainer}>
                        <div className={classes.tableContainer}>
                        <AutoSizer>
                                {
                                ({ width, height }) =>
                                            <InspectorTable
                                                {...tableProps}
                                                width={width}
                                                height={height}
                                                {...props} />
                                }
                        </AutoSizer>
                        </div>
                    </div>
                </div>
            </ModalManager>
        </MuiThemeProvider>);
};

export function renderApp(propertyTree: SharedPropertyTree, element: HTMLElement) {
    const dataBinder = new DataBinder();

    dataBinder.attachTo(propertyTree);

    // Listening to any change the root path of the PropertyDDS, and rendering the latest state of the
    // inspector tree-table.
    dataBinder.registerOnPath("/", ["insert", "remove", "modify"], _.debounce(() => {
        // Create an ES6 proxy for the DDS, this enables JS object interface for interacting with the DDS.
        // Note: This is what currently inspector table expect for "data" prop.
        const proxifiedDDS = PropertyProxy.proxify(propertyTree.root);
        ReactDOM.render(<InspectorApp data={proxifiedDDS} />, element);
    }, 20));
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeStyles } from "@material-ui/styles";
import React from "react";

import { IInspectorTableProps } from "./InspectorTableTypes.js";
import { SearchBox } from "./SearchBox.js";

const useStyles = makeStyles(
	{
		buttonGroup: {
			alignItems: "center",
			display: "flex",
			justifyContent: "flex-end",
		},
		root: {
			alignItems: "center",
			display: "flex",
			justifyContent: "flex-end",
			width: "100%",
		},
	},
	{ name: "InspectorTableHeader" },
);

export const InspectorTableHeader: React.FunctionComponent<Partial<IInspectorTableProps>> = ({
	searchBoxProps,
}) => {
	const classes = useStyles();
	return (
		<div className={classes.root}>
			<div className={classes.buttonGroup}>
				<SearchBox {...searchBoxProps} />
			</div>
		</div>
	);
};

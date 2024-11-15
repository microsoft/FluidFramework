/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Diff } from "@fluidframework/ai-collab/alpha";
import { Card, Typography, Box } from "@mui/material";
import React from "react";

interface DiffViewerProps {
	diffs: Diff[];
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ diffs }) => {
	return (
		<Box>
			{diffs.map((diff) => (
				<Card key={diff.id} sx={{ mb: 2, p: 2 }}>
					<Typography variant="h6">{diff.type === "error" ? "Error" : "Edit"}</Typography>
					<Typography variant="body1">{diff.description}</Typography>
				</Card>
			))}
		</Box>
	);
};

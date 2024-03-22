/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { storiesOf } from "@storybook/react";
import * as React from "react";
import { EditReferencePath } from "./EditReferencePath.js";
import { InspectorDecorator } from "./InspectorDecorator.js";
import { InspectorTableDecorator } from "./InspectorTableDecorator.js";

storiesOf("EditReferencePath", module)
	.addDecorator(InspectorDecorator)
	.addDecorator(InspectorTableDecorator)
	.add("default", () => {
		return (
			<div style={{ border: "1px solid rgba(1,1,1,0)", width: "600px", height: "400px" }}>
				<EditReferencePath
					onCancel={() => {}}
					onEdit={() => {
						console.log("Hello");
						return Promise.resolve();
					}}
					name={"dummy"}
					path={"dummyPath"}
					style={{ width: "600px" }}
				/>
			</div>
		);
	});

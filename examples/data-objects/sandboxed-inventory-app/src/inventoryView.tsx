/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { objectIdNumber, withMemoizedTreeObservations } from "@fluidframework/react/alpha";
import { useCallback } from "react";

import { type Inventory, Part } from "./schema.js";

/**
 * Inventory controls shared by the Host and Guest.
 */
export const InventoryView = withMemoizedTreeObservations(({ root }: { root: Inventory }) => {
	const parts = root.parts;
	const removePart = useCallback((part: Part) => parts.removeAt(parts.indexOf(part)), [parts]);

	return (
		<div>
			<ul>
				{parts.map((part) => (
					<PartView key={objectIdNumber(part)} part={part} remove={removePart} />
				))}
			</ul>
			<button
				type="button"
				onClick={() => parts.insertAtEnd(new Part({ name: "New Part", quantity: 0 }))}
			>
				Add Part
			</button>
		</div>
	);
});

const PartView = withMemoizedTreeObservations(
	({ part, remove }: { part: Part; remove: (part: Part) => void }) => (
		<li>
			<h3>{part.name}</h3>
			<div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
				<button
					type="button"
					aria-label={`Decrease ${part.name} quantity`}
					disabled={part.quantity <= 0}
					onClick={() => part.quantity--}
				>
					-
				</button>
				<output aria-label={`${part.name} quantity`}>{part.quantity}</output>
				<button
					type="button"
					aria-label={`Increase ${part.name} quantity`}
					onClick={() => part.quantity++}
				>
					+
				</button>
				<button type="button" aria-label={`Remove ${part.name}`} onClick={() => remove(part)}>
					Remove Part
				</button>
			</div>
		</li>
	),
);

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type FC, useEffect, useState } from "react";

import type { IClaimsDataObject } from "./container/index.js";

export interface IClaimsViewProps {
	claimsDataObject: IClaimsDataObject;
}

export const ClaimsView: FC<IClaimsViewProps> = ({ claimsDataObject }: IClaimsViewProps) => {
	// Re-render whenever a claim is made or an owner changes, locally or remotely.
	const [, forceUpdate] = useState({});
	const [keyToClaim, setKeyToClaim] = useState<string>("");
	const [status, setStatus] = useState<string>("");

	useEffect(() => {
		const onClaimsChanged = (): void => forceUpdate({});
		claimsDataObject.on("claimsChanged", onClaimsChanged);
		return (): void => {
			claimsDataObject.off("claimsChanged", onClaimsChanged);
		};
	}, [claimsDataObject]);

	const handleClaim = (): void => {
		const key = keyToClaim.trim();
		if (key.length === 0) {
			return;
		}
		setKeyToClaim("");
		claimsDataObject
			.trySetClaim(key)
			.then((accepted) => {
				// On a lost race the data object has already switched to the winner's handle;
				// we just note that the key was already taken.
				setStatus(
					accepted
						? `You claimed "${key}".`
						: `"${key}" was already claimed by another client.`,
				);
			})
			.catch((error: unknown) => {
				setStatus(`Claim failed: ${String(error)}`);
			});
	};

	return (
		<div style={{ fontFamily: "sans-serif", margin: "16px" }}>
			<h2>Claims</h2>
			<p>
				You are <strong>{claimsDataObject.claimant}</strong>. Type a key and claim it. Open
				this page in another tab to watch two clients compete for the same key — the first to
				claim it wins, and the loser is switched to the winner.
			</p>
			<div style={{ marginBottom: "12px" }}>
				<input
					type="text"
					placeholder="key to claim…"
					value={keyToClaim}
					onChange={(event) => setKeyToClaim(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							handleClaim();
						}
					}}
					style={{ width: "220px", marginRight: "8px" }}
				/>
				<button onClick={handleClaim} disabled={keyToClaim.trim().length === 0}>
					Claim
				</button>
			</div>
			<table style={{ borderCollapse: "collapse" }}>
				<thead>
					<tr>
						<th style={{ textAlign: "left", padding: "4px 12px" }}>Claimed key</th>
						<th style={{ textAlign: "left", padding: "4px 12px" }}>Owner</th>
					</tr>
				</thead>
				<tbody>
					{claimsDataObject.claimedKeys.map((key) => {
						const owner = claimsDataObject.getOwner(key);
						const ownedByMe = owner === claimsDataObject.claimant;
						return (
							<tr key={key}>
								<td style={{ padding: "4px 12px", fontWeight: "bold" }}>{key}</td>
								<td
									style={{
										padding: "4px 12px",
										color: owner === undefined ? "#999" : ownedByMe ? "#2a7" : "#555",
									}}
								>
									{owner ?? "— resolving… —"}
									{ownedByMe ? " (you)" : ""}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
			<p style={{ minHeight: "1.2em", color: "#333" }}>{status}</p>
		</div>
	);
};

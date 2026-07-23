/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type FC, useEffect, useState } from "react";

import { claimKey1, claimKey2, type IClaimsDataObject } from "./container/index.js";

export interface IClaimsViewProps {
	claimsDataObject: IClaimsDataObject;
}

const claimKeys = [claimKey1, claimKey2];

export const ClaimsView: FC<IClaimsViewProps> = ({ claimsDataObject }: IClaimsViewProps) => {
	// Re-render whenever a claim is made or an owner changes, locally or remotely.
	const [, forceUpdate] = useState({});
	const [status, setStatus] = useState<string>("");
	// Keys with a claim currently in flight. The Claims DDS throws if a second claim is started
	// for a key while the first is still pending, so we disable the button until it settles.
	const [claiming, setClaiming] = useState<ReadonlySet<string>>(() => new Set());

	useEffect(() => {
		const onClaimsChanged = (): void => forceUpdate({});
		claimsDataObject.on("claimsChanged", onClaimsChanged);
		return (): void => {
			claimsDataObject.off("claimsChanged", onClaimsChanged);
		};
	}, [claimsDataObject]);

	const handleClaim = (key: string): void => {
		setStatus(`Claiming "${key}"…`);
		setClaiming((prev) => new Set(prev).add(key));
		claimsDataObject
			.trySetClaim(key)
			.then((accepted) => {
				// On a lost race the data object has already resolved the winning key's owner;
				// we just note that the key was already taken.
				setStatus(
					accepted
						? `You claimed "${key}".`
						: `"${key}" was already claimed by another client.`,
				);
			})
			.catch((error: unknown) => {
				setStatus(`Claim failed: ${String(error)}`);
			})
			.finally(() => {
				setClaiming((prev) => {
					const next = new Set(prev);
					next.delete(key);
					return next;
				});
			});
	};

	return (
		<div style={{ fontFamily: "sans-serif", margin: "16px" }}>
			<h2>Claims</h2>
			<p>
				You are <strong>{claimsDataObject.claimant}</strong>. Each key below can be owned by
				only one client. Open this page in another tab to watch two clients compete for the
				same key — the first to claim it wins, and the loser is switched to the winner.
			</p>
			<table style={{ borderCollapse: "collapse" }}>
				<thead>
					<tr>
						<th style={{ textAlign: "left", padding: "4px 12px" }}>Key</th>
						<th style={{ textAlign: "left", padding: "4px 12px" }}>Owner</th>
						<th style={{ padding: "4px 12px" }} />
					</tr>
				</thead>
				<tbody>
					{claimKeys.map((key) => {
						const owner = claimsDataObject.getOwner(key);
						const ownedByMe = owner === claimsDataObject.claimant;
						const claimed = owner !== undefined;
						const inProgress = claiming.has(key);
						return (
							<tr key={key}>
								<td style={{ padding: "4px 12px", fontWeight: "bold" }}>{key}</td>
								<td
									style={{
										padding: "4px 12px",
										color: claimed ? (ownedByMe ? "#2a7" : "#555") : "#999",
									}}
								>
									{owner ?? "— unclaimed —"}
									{ownedByMe ? " (you)" : ""}
								</td>
								<td style={{ padding: "4px 12px" }}>
									<button onClick={() => handleClaim(key)} disabled={claimed || inProgress}>
										Claim
									</button>
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

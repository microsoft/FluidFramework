/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { makeStyles, useId, Input, Label, tokens, shorthands } from "@fluentui/react-components";
import { getFuzzTestTreeStates } from "@fluid-experimental/tree2";
import { FuzzTestState } from "./fuzzTestState";

export function MainView(): React.ReactElement {
	const seedId = useId("input-seed");
	const clientId = useId("input-client");

	const styles = useStyles();

	const [seedSelected, setSeedSelected] = React.useState(false);
	const [clientSelected, setClientSelected] = React.useState(false);

	const [seed, setSeed] = React.useState(0);
	const [client, setClient] = React.useState(0);

	const [fuzzTestStates, setFuzzTestStates] = React.useState<string[][]>();

	const [opNumber, setOpNumber] = React.useState(0);

	return (
		<div>
			<>
				<div className={styles.field}>
					<Label htmlFor={seedId}> Seed </Label>
					<Input
						appearance={"outline"}
						id={seedId}
						type="number"
						onChange={(e) => {
							setSeed(parseInt(e.target.value, 10));
							setSeedSelected(true);
						}}
					/>
				</div>
			</>

			<>
				<div className={styles.field}>
					<Label htmlFor={clientId}> Client </Label>
					<Input
						appearance={"outline"}
						id={clientId}
						type="number"
						onChange={(e) => {
							setClient(parseInt(e.target.value, 10));
							setClientSelected(true);
						}}
					/>
				</div>
			</>

			<>
				<div className={styles.field}>
					<Label htmlFor={clientId}>
						opNumber : {fuzzTestStates === undefined ? "" : opNumber}
					</Label>
					<button
						disabled={!fuzzTestStates || opNumber === 0}
						onClick={() => setOpNumber(Math.max(0, opNumber - 1))}
					>
						&lt;&lt;
					</button>
					<button
						disabled={!fuzzTestStates || opNumber >= fuzzTestStates[0].length - 1}
						onClick={() => setOpNumber(opNumber + 1)}
					>
						&gt;&gt;
					</button>
				</div>
			</>

			<>
				<div className={styles.field}>
					<button
						disabled={!(seedSelected && clientSelected)}
						// eslint-disable-next-line @typescript-eslint/no-misused-promises
						onClick={async () =>
							setFuzzTestStates(await getFuzzTestTreeStates(seed, client))
						}
					>
						Submit
					</button>
				</div>
			</>

			{fuzzTestStates === undefined ? (
				<div></div>
			) : (
				fuzzTestStates.map((item, idx) => (
					<>
						<h3> Client: {idx + 1} </h3>
						<FuzzTestState key={idx} treeState={item} opNumber={opNumber} />
					</>
				))
			)}
		</div>
	);
}

const useStyles = makeStyles({
	field: {
		display: "grid",
		gridRowGap: tokens.spacingVerticalXXS,
		marginTop: tokens.spacingVerticalMNudge,
		...shorthands.padding(tokens.spacingHorizontalMNudge),
	},
});

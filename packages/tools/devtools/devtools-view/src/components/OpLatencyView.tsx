/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { Body1, Body1Strong, Subtitle1, makeStyles } from "@fluentui/react-components";
import { DynamicComposedChart } from "./graphs";

const useStyles = makeStyles({
	flexColumn: {
		display: "flex",
		flexDirection: "column",
	},
	flexRow: {
		display: "flex",
		flexDirection: "row",
	},
	/**
	 * Main container housing all the child components
	 */
	mainContainer: {
		width: "100%",
		height: "300px",
	},
	/**
	 * Where the graph is described
	 */
	graphAboutContainer: {
		marginTop: "15px",
	},
	/**
	 * Where the op lifecycle phases are described
	 */
	opPhasesSection: {
		marginTop: "15px",
	},
});

/**
 * Page that shows op latency metrics.
 * @remarks TODO: Once Op Latency data is available from {@link messageRelay}, the op latency data should be passed into the graph instead of this test data set.
 */
export function OpLatencyView(): React.ReactElement {
	const styles = useStyles();

	return (
		<div className={styles.mainContainer} data-testid="test-op-latency-view">
			<h3>Op Latency</h3>
			<DynamicComposedChart
				margin={{
					top: 15,
					right: 30,
					left: -15,
					bottom: 40,
				}}
				legendStyle={{
					marginLeft: 25,
					bottom: -5,
				}}
				yAxisUnitDisplayName="ms"
				// NOTE: Because Op Latency data is not yet available, this is a placeholder
				dataSets={[]}
			/>
			<div className={styles.graphAboutContainer}>
				<div className={styles.flexColumn}>
					<Subtitle1>About</Subtitle1>
					<Body1>
						{`This Graph shows Fluid Op (Operation) Latency metrics.
					As you make changes in your Fluid-based application, you'll see this graph update in real time with latency data for any ops your client produces.`}
						&nbsp;
						<a
							target="_blank"
							rel="noreferrer"
							href="https://fluidframework.com/docs/concepts/tob/"
						>
							{`Learn more about ops.`}
						</a>
					</Body1>
				</div>

				<div className={styles.opPhasesSection}>
					<Body1Strong>{`Ops in Fluid go through four steps:`}</Body1Strong>
					<ol>
						<li>
							<Body1>Op is submitted by the application.</Body1>
						</li>
						<li>
							<Body1>
								Op is sent to service. Note: we do not know for sure when the op is
								actually sent on the network, we only track when it is added to a
								local outbound queue.
							</Body1>
						</li>
						<li>
							<Body1>(Sequenced) Op is received from service.</Body1>
						</li>
						<li>
							<Body1>
								(Sequenced) Op is processed and passed to the application.
							</Body1>
						</li>
					</ol>
				</div>
				<Body1Strong>
					With the above four phases in mind, these are the definitions for the metrics in
					the graph above:
				</Body1Strong>
				<ol>
					<li>
						<div className={styles.flexRow}>
							<Body1Strong>{`Duration Outbound:`}&nbsp;</Body1Strong>
							<Body1>{`Time in milliseconds between (1) and (2); The time between an op being submitted by the application and it being put in the outbound queue to be sent to the ordering service.`}</Body1>
						</div>
					</li>
					<li>
						<div className={styles.flexRow}>
							<Body1Strong>{`Duration Network:`}&nbsp;</Body1Strong>
							<Body1>{`Time between (2) and (3); how long in milliseconds it took for the op to be sequenced by the service, sent back, and received by the Fluid client.`}</Body1>
						</div>
					</li>
					<li>
						<div className={styles.flexRow}>
							<Body1Strong>{`Duration Inbound:`}&nbsp;</Body1Strong>
							<Body1>{`Time between (3) and (4); how long in milliseconds it took to do framework-related processing on a received op before letting the application react to it`}</Body1>
						</div>
					</li>
				</ol>
			</div>
		</div>
	);
}

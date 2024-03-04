/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { LoggingError } from "@fluidframework/telemetry-utils";
import { UnassignedSequenceNumber } from "../constants.js";
import { IMergeTreeOp } from "../ops.js";
import { TextSegment } from "../textSegment.js";
import { IMergeTreeDeltaOpArgs, MergeTreeMaintenanceType } from "../mergeTreeDeltaCallback.js";
import { matchProperties, PropertySet } from "../properties.js";
import { depthFirstNodeWalk } from "../mergeTreeNodeWalk.js";
import { Marker, seqLTE, toRemovalInfo } from "../mergeTreeNodes.js";
import { IMergeTreeOptions } from "../index.js";
import { TestClient } from "./testClient.js";

function getOpString(msg: ISequencedDocumentMessage | undefined) {
	if (msg === undefined) {
		return "";
	}
	const op = msg.contents as IMergeTreeOp;
	const opType = op.type.toString();
	const opPos =
		// eslint-disable-next-line @typescript-eslint/dot-notation
		op?.["pos1"] !== undefined
			? // eslint-disable-next-line @typescript-eslint/dot-notation
			  `@${op["pos1"]}${op["pos2"] !== undefined ? `,${op["pos2"]}` : ""}`
			: "";

	const seq =
		msg.sequenceNumber < 0 ? "L" : (msg.sequenceNumber - msg.minimumSequenceNumber).toString();
	const ref = (msg.referenceSequenceNumber - msg.minimumSequenceNumber).toString();
	const client = msg.clientId;
	return `${seq}:${ref}:${client}${opType}${opPos}`;
}

function arePropsEmpty(props: PropertySet | undefined) {
	return props === undefined || Object.entries(props).length === 0;
}

/**
 * Compare properties, allowing empty to match undefined
 */
function matchPropertiesHandleEmpty(a: PropertySet | undefined, b: PropertySet | undefined) {
	return matchProperties(a, b) || (arePropsEmpty(a) && arePropsEmpty(b));
}

type ClientMap<TClientName extends string> = Partial<Record<TClientName, TestClient>>;

export function createClientsAtInitialState<
	TClients extends ClientMap<TClientName>,
	TClientName extends string = string & keyof TClients,
>(
	opts: {
		initialState: string;
		options?: IMergeTreeOptions & PropertySet;
	},
	...clientIds: TClientName[]
): Record<keyof TClients, TestClient> & { all: TestClient[] } {
	const setup = (c: TestClient) => {
		c.insertTextLocal(0, opts.initialState);
		while (c.getText().includes("-")) {
			const index = c.getText().indexOf("-");
			c.removeRangeLocal(index, index + 1);
		}
	};
	const all: TestClient[] = [];
	const clients: Partial<Record<keyof TClients, TestClient>> = {};
	for (const id of clientIds) {
		if (clients[id] === undefined) {
			const client = new TestClient(opts.options);
			clients[id] = client;
			all.push(client);
			setup(client);
			client.startOrUpdateCollaboration(id);
		}
	}

	return { ...(clients as Record<keyof TClients, TestClient>), all };
}
export class TestClientLogger {
	public static toString(clients: readonly TestClient[]) {
		return clients
			.map((c) => this.getSegString(c))
			.reduce<[string, string]>(
				(pv, cv) => {
					pv[0] += `|${cv.acked.padEnd(cv.local.length, "")}`;
					pv[1] += `|${cv.local.padEnd(cv.acked.length, "")}`;
					return pv;
				},
				["", ""],
			)
			.join("\n");
	}

	private readonly incrementalLog = false;

	private readonly paddings: number[] = [];
	private readonly roundLogLines: string[][] = [];

	private ackedLine: string[] = [];
	private localLine: string[] = [];
	// initialize to private instance, so first real edit will create a new line
	private lastDeltaArgs: IMergeTreeDeltaOpArgs | undefined;

	private readonly disposeCallbacks: (() => void)[] = [];

	/**
	 * Unsubscribes this logger from its clients' events. Consider using this for tests with client lifetime
	 * extending significantly past the logger's.
	 */
	public dispose(): void {
		for (const cb of this.disposeCallbacks) {
			cb();
		}
		this.disposeCallbacks.length = 0;
	}

	constructor(
		private readonly clients: readonly TestClient[],
		private readonly title?: string,
	) {
		const logHeaders: string[] = [];
		clients.forEach((c, i) => {
			logHeaders.push("op");
			logHeaders.push(`client ${c.longClientId}`);
			const callback = (deltaArgs: IMergeTreeDeltaOpArgs | undefined) => {
				if (
					this.lastDeltaArgs?.sequencedMessage !== deltaArgs?.sequencedMessage ||
					this.lastDeltaArgs?.op !== deltaArgs?.op
				) {
					this.addNewLogLine();
					this.lastDeltaArgs = deltaArgs;
				}
				const clientLogIndex = i * 2;

				this.ackedLine[clientLogIndex] =
					deltaArgs === undefined
						? ""
						: getOpString(
								deltaArgs.sequencedMessage !== undefined
									? { ...deltaArgs.sequencedMessage, contents: deltaArgs.op }
									: c.makeOpMessage(deltaArgs.op),
						  );
				const segStrings = TestClientLogger.getSegString(c);
				this.ackedLine[clientLogIndex + 1] = segStrings.acked;
				this.localLine[clientLogIndex + 1] = segStrings.local;

				this.paddings[clientLogIndex] = Math.max(
					this.ackedLine[clientLogIndex].length,
					this.localLine[clientLogIndex].length,
					this.paddings[clientLogIndex],
				);

				this.paddings[clientLogIndex + 1] = Math.max(
					this.ackedLine[clientLogIndex + 1].length,
					this.localLine[clientLogIndex + 1].length,
					this.paddings[clientLogIndex + 1],
				);
			};

			const maintenanceCallback = (main, op) => {
				if (main.operation === MergeTreeMaintenanceType.ACKNOWLEDGED) {
					callback(op);
				}
			};
			c.on("delta", callback);
			c.on("maintenance", maintenanceCallback);
			this.disposeCallbacks.push(() => {
				c.off("delta", callback);
				c.off("maintenance", maintenanceCallback);
			});
		});
		this.roundLogLines.push(logHeaders);
		this.roundLogLines[0].forEach((v) => this.paddings.push(v.length));
		this.addNewLogLine(); // capture initial state
	}

	private addNewLogLine() {
		if (this.incrementalLog) {
			while (this.roundLogLines.length > 0) {
				const logLine = this.roundLogLines.shift();
				if (logLine?.some((c) => c.trim().length > 0)) {
					console.log(logLine.map((v, i) => v.padEnd(this.paddings[i])).join(" | "));
				}
			}
		}
		this.ackedLine = [];
		this.localLine = [];
		this.clients.forEach((cc, clientLogIndex) => {
			const segStrings = TestClientLogger.getSegString(cc);
			this.ackedLine.push("", segStrings.acked);
			this.localLine.push("", segStrings.local);

			this.paddings[clientLogIndex] = Math.max(
				this.ackedLine[clientLogIndex].length,
				this.localLine[clientLogIndex].length,
				this.paddings[clientLogIndex],
			);

			this.paddings[clientLogIndex + 1] = Math.max(
				this.ackedLine[clientLogIndex + 1].length,
				this.localLine[clientLogIndex + 1].length,
				this.paddings[clientLogIndex + 1],
			);
		});
		this.roundLogLines.push(this.ackedLine);
		this.roundLogLines.push(this.localLine);
	}

	public validate(opts?: { clear?: boolean; baseText?: string; errorPrefix?: string }) {
		const baseText = opts?.baseText ?? this.clients[0].getText();
		const errorPrefix = opts?.errorPrefix ? `${opts?.errorPrefix}: ` : "";
		// cache all the properties of client 0 for faster look up
		const properties = Array.from({ length: this.clients[0].getLength() }).map((_, i) =>
			this.clients[0].getPropertiesAtPosition(i),
		);
		this.clients.forEach((c) => {
			if (opts?.baseText === undefined && c === this.clients[0]) {
				return;
			}
			// ensure all clients have seen the same ops
			assert.equal(
				c.getCurrentSeq(),
				this.clients[0].getCurrentSeq(),
				`${errorPrefix}${c.longClientId} current seq does not match client ${this.clients[0].longClientId}`,
			);
			// Pre-check to avoid this.toString() in the string template
			if (c.getText() !== baseText) {
				assert.equal(
					c.getText(),
					baseText,
					`${errorPrefix}\n${this.toString()}\nClient ${
						c.longClientId
					} does not match client ${
						opts?.baseText ? "baseText" : this.clients[0].longClientId
					}`,
				);
			}

			if (c === this.clients[0]) {
				return;
			}
			let pos = 0;
			depthFirstNodeWalk(c.mergeTree.root, c.mergeTree.root.children[0], undefined, (seg) => {
				if (toRemovalInfo(seg) === undefined) {
					const segProps = seg.properties;
					for (let i = 0; i < seg.cachedLength; i++) {
						if (!matchPropertiesHandleEmpty(segProps, properties[pos + i])) {
							assert.deepStrictEqual(
								segProps,
								properties[pos + i],
								`${errorPrefix}\n${this.toString()}\nClient ${
									c.longClientId
								} does not match client ${
									this.clients[0].longClientId
								} properties at pos ${pos + i}`,
							);
						}
					}
					pos += seg.cachedLength;
				}
			});
		});

		if (opts?.clear === true) {
			this.roundLogLines.splice(1, this.roundLogLines.length);
			this.roundLogLines[0].forEach((v, i) => (this.paddings[i] = v.length));
			this.addNewLogLine(); // capture initial state
		}
		return baseText;
	}

	static validate(clients: readonly TestClient[], title?: string) {
		const logger = new TestClientLogger(clients, title);
		const result = logger.validate();
		logger.dispose();
		return result;
	}

	public toString(excludeHeader: boolean = false) {
		let str = "";
		if (!excludeHeader) {
			str +=
				`_: Local State\n` +
				`-: Deleted    ~:Deleted <= MinSeq\n` +
				`*: Unacked Insert and Delete\n` +
				`${this.clients[0].getCollabWindow().minSeq}: msn/offset\n` +
				`Op format <seq>:<ref>:<client><type>@<pos1>,<pos2>\n` +
				`sequence number represented as offset from msn. L means local.\n` +
				`op types: 0) insert 1) remove 2) annotate\n`;

			if (this.title) {
				str += `${this.title}\n`;
			}
		}
		str += this.roundLogLines
			.filter((line) => line.some((c) => c.trim().length > 0))
			.map((line) => line.map((v, i) => v.padEnd(this.paddings[i])).join(" | "))
			.join("\n");
		return str;
	}

	public addLogsToError(e: unknown): Error {
		if (e instanceof Error) {
			e.message += `\n${this.toString()}`;
			return e;
		}

		return new LoggingError(`${e}\n${this.toString()}`);
	}

	private static getSegString(client: TestClient): { acked: string; local: string } {
		let acked: string = "";
		let local: string = "";
		const nodes = [...client.mergeTree.root.children];
		let parent = nodes[0]?.parent;
		while (nodes.length > 0) {
			const node = nodes.shift();
			if (node) {
				if (node.isLeaf()) {
					if (node.parent !== parent) {
						if (acked.length > 0) {
							acked += " ";
							local += " ";
						}
						parent = node.parent;
					}
					const text = TextSegment.is(node)
						? node.text
						: Marker.is(node)
						? "¶"
						: undefined;
					if (text !== undefined) {
						const removedNode = toRemovalInfo(node);
						if (removedNode !== undefined) {
							if (removedNode.removedSeq === UnassignedSequenceNumber) {
								acked += "_".repeat(text.length);
								local +=
									node.seq === UnassignedSequenceNumber
										? "*".repeat(text.length)
										: "-".repeat(text.length);
							} else {
								const removedSymbol = seqLTE(
									removedNode.removedSeq,
									client.getCollabWindow().minSeq,
								)
									? "~"
									: "-";
								acked += removedSymbol.repeat(text.length);
								local += " ".repeat(text.length);
							}
						} else {
							if (node.seq === UnassignedSequenceNumber) {
								acked += "_".repeat(text.length);
								local += text;
							} else {
								acked += text;
								local += " ".repeat(text.length);
							}
						}
					}
				} else {
					nodes.push(...node.children);
				}
			}
		}
		return { acked, local };
	}
}

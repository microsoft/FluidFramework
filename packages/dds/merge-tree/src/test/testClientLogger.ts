/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { LoggingError } from "@fluidframework/telemetry-utils/internal";

import { UnassignedSequenceNumber } from "../constants.js";
import { IMergeTreeOptions } from "../index.js";
import {
	IMergeTreeDeltaOpArgs,
	MergeTreeMaintenanceType,
	type IMergeTreeMaintenanceCallbackArgs,
} from "../mergeTreeDeltaCallback.js";
import { depthFirstNodeWalk } from "../mergeTreeNodeWalk.js";
import { Marker, seqLTE, type ISegmentPrivate } from "../mergeTreeNodes.js";
import { IMergeTreeOp, MergeTreeDeltaType } from "../ops.js";
import { PropertySet, matchProperties } from "../properties.js";
import { toInsertionInfo, toMoveInfo, toRemovalInfo } from "../segmentInfos.js";
import { TextSegment } from "../textSegment.js";

import { TestClient } from "./testClient.js";

function getOpString(msg: ISequencedDocumentMessage | undefined): string {
	if (msg === undefined) {
		return "";
	}
	const op = msg.contents as IMergeTreeOp;
	const opType = op.type.toString();
	let opPos;
	if (op.type === MergeTreeDeltaType.OBLITERATE_SIDED) {
		const pos1Side =
			op.type === MergeTreeDeltaType.OBLITERATE_SIDED ? (op.pos1.before ? "[" : "(") : "";
		const pos2Side =
			op.type === MergeTreeDeltaType.OBLITERATE_SIDED ? (op.pos2.before ? ")" : "]") : "";
		opPos = `@${pos1Side}${op.pos1.pos},${op.pos2.pos}${pos2Side}`;
	} else {
		opPos =
			// eslint-disable-next-line @typescript-eslint/dot-notation
			op?.["pos1"] === undefined
				? ""
				: // eslint-disable-next-line @typescript-eslint/dot-notation
					`@${op["pos1"]}${op["pos2"] === undefined ? "" : `,${op["pos2"]}`}`;
	}

	const seq = msg.sequenceNumber < 0 ? "L" : msg.sequenceNumber.toString();
	const ref = msg.referenceSequenceNumber.toString();
	const client = msg.clientId;
	return `${seq}:${ref}:${client}${opType}${opPos}`;
}

function arePropsEmpty(props: PropertySet | undefined): boolean {
	return props === undefined || Object.entries(props).length === 0;
}

/**
 * Compare properties, allowing empty to match undefined
 */
function matchPropertiesHandleEmpty(
	a: PropertySet | undefined,
	b: PropertySet | undefined,
): boolean {
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
	const setup = (c: TestClient): void => {
		if (opts.initialState.length > 0) {
			c.insertTextLocal(0, opts.initialState);
			while (c.getText().includes("-")) {
				const index = c.getText().indexOf("-");
				c.removeRangeLocal(index, index + 1);
			}
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
	public static toString(clients: readonly TestClient[]): string {
		return (
			clients
				.map((c) => this.getSegString(c))
				// eslint-disable-next-line unicorn/no-array-reduce
				.reduce<[string, string]>(
					(pv, cv) => {
						pv[0] += `|${cv.acked.padEnd(cv.local.length, "")}`;
						pv[1] += `|${cv.local.padEnd(cv.acked.length, "")}`;
						return pv;
					},
					["", ""],
				)
				.join("\n")
		);
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
		for (const [i, c] of clients.entries()) {
			logHeaders.push("op", `client ${c.longClientId}`);
			const callback = (deltaArgs: IMergeTreeDeltaOpArgs | undefined): void => {
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
								deltaArgs.sequencedMessage === undefined
									? c.makeOpMessage(deltaArgs.op)
									: { ...deltaArgs.sequencedMessage, contents: deltaArgs.op },
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

			const maintenanceCallback = (
				main: IMergeTreeMaintenanceCallbackArgs,
				op: IMergeTreeDeltaOpArgs | undefined,
			): void => {
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
		}
		this.roundLogLines.push(logHeaders);
		for (const v of this.roundLogLines[0]) this.paddings.push(v.length);
		this.addNewLogLine(); // capture initial state
	}

	private addNewLogLine(): void {
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
		for (const [clientLogIndex, cc] of this.clients.entries()) {
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
		}
		this.roundLogLines.push(this.ackedLine, this.localLine);
	}

	public validate(opts?: {
		clear?: boolean;
		baseText?: string;
		errorPrefix?: string;
	}): string {
		const baseText = opts?.baseText ?? this.clients[0].getText();
		const errorPrefix = opts?.errorPrefix ? `${opts?.errorPrefix}: ` : "";
		// cache all the properties of client 0 for faster look up
		const properties = Array.from({ length: this.clients[0].getLength() }).map((_, i) =>
			this.clients[0].getPropertiesAtPosition(i),
		);
		for (const c of this.clients) {
			if (opts?.baseText === undefined && c === this.clients[0]) {
				continue;
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
				continue;
			}
			let pos = 0;
			depthFirstNodeWalk(c.mergeTree.root, c.mergeTree.root.children[0], undefined, (seg) => {
				if (toMoveOrRemove(seg) === undefined) {
					const segProps = seg.properties;
					for (let i = 0; i < seg.cachedLength; i++) {
						if (!matchPropertiesHandleEmpty(segProps, properties[pos + i])) {
							assert.deepStrictEqual(
								segProps,
								properties[pos + i],
								`${errorPrefix}\n${this.toString()}\nClient ${
									c.longClientId
								} does not match client ${this.clients[0].longClientId} properties at pos ${
									pos + i
								}`,
							);
						}
					}
					pos += seg.cachedLength;
				}
			});
		}

		if (opts?.clear === true) {
			this.roundLogLines.splice(1, this.roundLogLines.length);
			for (const [i, v] of this.roundLogLines[0].entries()) this.paddings[i] = v.length;
			this.addNewLogLine(); // capture initial state
		}
		return baseText;
	}

	static validate(clients: readonly TestClient[], title?: string): string {
		const logger = new TestClientLogger(clients, title);
		const result = logger.validate();
		logger.dispose();
		return result;
	}

	public toString(excludeHeader: boolean = false): string {
		let str = "";
		if (!excludeHeader) {
			str +=
				`_: Local State\n` +
				`-: Deleted    ~:Deleted <= MinSeq\n` +
				`*: Unacked Insert and Delete\n` +
				`${this.clients[0].getCollabWindow().minSeq}: msn/offset\n` +
				`Op format <seq>:<ref>:<client><type>@<side1><pos1>,<pos2><side2>\n` +
				`sequence number represented as offset from msn. L means local.\n` +
				`op types: 0) insert 1) remove 2) annotate 4) obliterate\n` +
				`for obliterates: [] indicates that the range includes the position,\n` +
				`and () indicates that the range excludes that position from the obliterate.\n`;

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
					const text = TextSegment.is(node) ? node.text : Marker.is(node) ? "¶" : undefined;
					const insertionSeq = toInsertionInfo(node)?.insert.seq;
					if (text !== undefined) {
						const removedNode = toMoveOrRemove(node);
						if (removedNode === undefined) {
							if (insertionSeq === UnassignedSequenceNumber) {
								acked += "_".repeat(text.length);
								local += text;
							} else {
								acked += text;
								local += " ".repeat(text.length);
							}
						} else {
							if (removedNode.seq === UnassignedSequenceNumber) {
								acked += "_".repeat(text.length);
								local +=
									insertionSeq === UnassignedSequenceNumber
										? "*".repeat(text.length)
										: "-".repeat(text.length);
							} else {
								const removedSymbol = seqLTE(removedNode.seq, client.getCollabWindow().minSeq)
									? "~"
									: "-";
								acked += removedSymbol.repeat(text.length);
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

function toMoveOrRemove(segment: ISegmentPrivate): { seq: number } | undefined {
	const mi = toMoveInfo(segment);
	const ri = toRemovalInfo(segment);
	if (mi !== undefined || ri !== undefined) {
		return {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-non-null-asserted-optional-chain
			seq: mi?.moves[0].seq ?? ri?.removes[0].seq!,
		};
	}
}

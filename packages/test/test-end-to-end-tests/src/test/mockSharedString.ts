/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import type {
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IChannelStorageService,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import { type ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import type {
	ITelemetryContext,
	IExperimentalIncrementalSummaryContext,
	ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import {
	SharedObject,
	type IFluidSerializer,
	type ISharedObjectEvents,
} from "@fluidframework/shared-object-base/internal";
import { pkgVersion } from "../packageVersion.js";

// Mock insert shared string factory that only supports inserting text
export class MockInsertSharedStringFactory implements IChannelFactory<MockInsertSharedString> {
	public static readonly Type = "insertSharedString";
	public static readonly Attributes: IChannelAttributes = {
		type: MockInsertSharedStringFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};
	public get type(): string {
		return MockInsertSharedStringFactory.Type;
	}
	public get attributes(): IChannelAttributes {
		return MockInsertSharedStringFactory.Attributes;
	}
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<MockInsertSharedString> {
		const sharedObject = new MockInsertSharedString(id, runtime, attributes, "InsertString");
		await sharedObject.load(services);
		return sharedObject;
	}
	public create(document: IFluidDataStoreRuntime, id: string): MockInsertSharedString {
		return new MockInsertSharedString(id, document, this.attributes, "InsertString");
	}
}

// Note: other DDSes have called this variable snapshotFileName
const headerBlobName = "header";
interface ISnapshot {
	inserts: ITrimmableInsert[];
	baseText: string;
	currentSequenceNumber: number;
	minimumSequenceNumber: number;
}

interface IInsert {
	text: string;
	index: number;
	referenceSequenceNumber: number;
}

export interface ITrimmableInsert extends IInsert {
	sequenceNumber: number;
}

interface ILocalInsert extends IInsert {
	localIndex: number;
}

interface IInsertOp extends IInsert {
	type: "insert";
	index: number;
	text: string;
}

export interface IInsertStringEvent extends ISharedObjectEvents {
	(event: "valueChanged", listener: (insert: ITrimmableInsert) => void);
}

function applyInsert(base: string, insert: IInsert): string {
	return base.slice(0, insert.index) + insert.text + base.slice(insert.index);
}

// The goal of this dds is to test the minimum sequence number window
// It is capable of inserting text only.
// This DDS works very simply, it is insert only. All local edits are applied on top of the remote edits.
// Trimming occurs when we process minimum sequence number greater than the reference sequence number of the beginning inserts.
// The merge conflict resolution is rebase only.
export class MockInsertSharedString extends SharedObject<IInsertStringEvent> {
	static getFactory(): IChannelFactory {
		return new MockInsertSharedStringFactory();
	}

	// In memory data that should be consistent across all clients at the same seq number
	private _inserts: ITrimmableInsert[] = [];
	private _baseText = "";
	private _sequenceNumber = 0;
	private _minimumSequenceNumber = 0;

	// Local Memory - data that may not be consistent across clients as is impacted by local changes
	private _localInsertIndex: number = 0;
	private _localInserts: ILocalInsert[] = [];

	// API Surface
	// For testing purposes we expose inserts
	public get inserts(): ITrimmableInsert[] {
		return this._inserts;
	}

	// This would be a realistic API for exposing text
	// All we are doing here is applying two sorted arrays by reference sequence number
	public get text(): string {
		let value = this._baseText;
		let i = 0;
		let j = 0;
		while (i < this.inserts.length && j < this._localInserts.length) {
			const remoteInsert = this.inserts[i];
			const localInsert = this._localInserts[j];
			if (remoteInsert.referenceSequenceNumber <= localInsert.referenceSequenceNumber) {
				value = applyInsert(value, remoteInsert);
				i++;
			} else {
				value = applyInsert(value, localInsert);
				j++;
			}
		}
		if (i < this.inserts.length) {
			for (; i < this.inserts.length; i++) {
				value = applyInsert(value, this.inserts[i]);
			}
		} else {
			for (; j < this._localInserts.length; j++) {
				value = applyInsert(value, this._localInserts[j]);
			}
		}
		return value;
	}

	// This would be a realistic API for inserting text
	public insertText(index: number, text: string) {
		const insertOp: IInsertOp = {
			type: "insert",
			index,
			text,
			referenceSequenceNumber: this._sequenceNumber,
		};
		const localIndex = this._localInsertIndex++;

		this._localInserts.push({
			localIndex,
			index,
			text,
			referenceSequenceNumber: this._sequenceNumber,
		});

		this.submitLocalMessage(insertOp, localIndex);
	}

	// Summarize and load
	protected summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext | undefined,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined,
	): ISummaryTreeWithStats {
		const builder = new SummaryTreeBuilder();

		const content: ISnapshot = {
			inserts: this.inserts,
			baseText: this._baseText,
			currentSequenceNumber: this._sequenceNumber,
			minimumSequenceNumber: this._minimumSequenceNumber,
		};

		builder.addBlob(headerBlobName, JSON.stringify(content));
		return builder.getSummaryTree();
	}
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const content = await readAndParse<ISnapshot>(storage, headerBlobName);
		this._inserts = content.inserts;
		this._baseText = content.baseText;
		this._sequenceNumber = content.currentSequenceNumber;
		this._minimumSequenceNumber = content.minimumSequenceNumber;
	}

	// Op processing, including stashed ops!
	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		if (message.type === MessageType.Operation) {
			const op = message.contents as IInsertOp;
			switch (op.type) {
				case "insert": {
					assert(
						op.referenceSequenceNumber >= this._minimumSequenceNumber,
						`Op with ref ${op.referenceSequenceNumber} can't be applied with min ${this._minimumSequenceNumber}!`,
					);

					if (local) {
						const insert = this._localInserts.find(
							(insert) => insert.localIndex === localOpMetadata,
						);
						assert(insert !== undefined, "Insert not found");
						this._localInserts.splice(this._localInserts.indexOf(insert), 1);
					}
					const trimmableInsert: ITrimmableInsert = {
						sequenceNumber: message.sequenceNumber,
						text: op.text,
						index: op.index,
						referenceSequenceNumber: op.referenceSequenceNumber,
					};
					this._inserts, trimmableInsert;

					let i = this.inserts.length;
					while (
						i > 0 &&
						this.inserts[i - 1].referenceSequenceNumber >
							trimmableInsert.referenceSequenceNumber
					) {
						i--;
					}
					this.inserts.splice(i, 0, trimmableInsert);

					this.trimLocalState(message.minimumSequenceNumber);
					this._sequenceNumber = message.sequenceNumber;
					this._minimumSequenceNumber = message.minimumSequenceNumber;
					this.emit("valueChanged", trimmableInsert);
					break;
				}
				default:
					throw new Error("Unknown operation");
			}
		}
	}

	// This trims the global local inserts so that the number of IInserts that need to be processed are based on the minimum sequence number.
	private trimLocalState(minimumSequenceNumber: number) {
		while (this.inserts.length > 0 && this.inserts[0].sequenceNumber < minimumSequenceNumber) {
			const insert = this.inserts.shift();
			assert(insert !== undefined, "Insert not found");
			this._baseText = applyInsert(this._baseText, insert);
		}
	}

	// Yeah, this should be simple as heck
	protected applyStashedOp(content: IInsertOp): void {
		this.insertText(content.index, content.text);
	}
	protected onDisconnect() {}
}

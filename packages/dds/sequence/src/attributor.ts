import { assert, bufferToString, stringToBuffer } from "@fluidframework/common-utils";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage, IUser } from "@fluidframework/protocol-definitions";
import { InternedStringId, MutableStringInterner } from "./stringInterner";
import { gzip, ungzip } from 'pako';
import { UsageError } from "@fluidframework/container-utils";

// Concrete types for a particular `Attributor` implementation
interface SerializedAttributor {
	interner: readonly string[]; /* result of calling getSerializable() on an ObjectInterner */
	seqs: number[]
	timestamps: number[];
	attributionRefs: InternedStringId[];
}

interface AttributionInfo {
	user: IUser;
	timestamp: number;
}

// TODO: Make constructor and serialize take in an encoder/decoder in which we can swap out different 
// compression strategies.
export interface IAttributor {
	getAttributionInfo(seq: number): AttributionInfo;

	serialize(): string;
}

// encode: (change: IPropertyTreeMessage) => {
// 	const changeSetStr = JSON.stringify(change.changeSet);
// 	const unzipped = new TextEncoder().encode(changeSetStr);
// 	const zipped: Buffer = encodeFn(unzipped);
// 	const zippedStr = bufferToString(zipped, "base64");
// 	if (zippedStr.length < changeSetStr.length) {
// 		// eslint-disable-next-line @typescript-eslint/dot-notation
// 		change["isZipped"] = "1";
// 		change.changeSet = zippedStr;
// 	}
// 	return change;
// },
// decode: (transferChange: IPropertyTreeMessage) => {
// 	// eslint-disable-next-line @typescript-eslint/dot-notation
// 	if (transferChange["isZipped"]) {
// 		const zipped = new Uint8Array(stringToBuffer(transferChange.changeSet, "base64"));
// 		const unzipped = decodeFn(zipped);
// 		const changeSetStr = new TextDecoder().decode(unzipped);
// 		transferChange.changeSet = JSON.parse(changeSetStr);
// 	}
// 	return transferChange;
// },

export class Attributor implements IAttributor {
	private seqToInfo: Map<number, AttributionInfo> = new Map();

	constructor(
		runtime: IFluidDataStoreRuntime,
		serializedString?: string,
	) {
		// look at propertyTreeExtFactories
		if (serializedString) {
			const zipped = new Uint8Array(stringToBuffer(serializedString, "base64"));
			const unzipped = ungzip(zipped);
			const serialized: SerializedAttributor = JSON.parse(new TextDecoder().decode(unzipped));
			const interner = new MutableStringInterner(serialized.interner);
			const { seqs, timestamps, attributionRefs } = serialized;
			assert(seqs.length === timestamps.length && timestamps.length === attributionRefs.length, "serialized attribution columns should have the same length");
			for (let i = 0; i < seqs.length; i++) {
				const seq = seqs[i];
				const timestamp = timestamps[i];
				const ref = attributionRefs[i];
				const user: IUser = JSON.parse(interner.getString(ref));
				this.seqToInfo.set(seq, { user, timestamp });
			}
		}

		const { deltaManager  } = runtime;
		deltaManager.on("op", (message: ISequencedDocumentMessage) => {
			const client = runtime.getAudience().getMember(message.clientId);
			 // TODO: This case may be legitimate, and if so we need to figure out how to handle it.
			assert(client !== undefined, "Received message from user not in the audience");
			this.seqToInfo.set(message.sequenceNumber, { user: client.user, timestamp: message.timestamp });
		});
	}

	public getAttributionInfo(seq: number): AttributionInfo {
		const result = this.seqToInfo.get(seq);
		// TODO: This error handling is awkward; this message doesn't make it clear what went wrong.
		if (!result) {
			throw new UsageError("Requested attribution information for a seq not stored.")
		}
		return result;
	}

	public serialize(): string {
		const interner = new MutableStringInterner();
		const seqs: number[] = []
		const timestamps: number[] = [];
		const attributionRefs: InternedStringId[] = [];
		const deltaTimestamps = new Array(timestamps.length);
		for (const [seq, { user, timestamp }] of this.seqToInfo.entries()) {
			seqs.push(seq);
			timestamps.push(timestamp);
			const ref = interner.getOrCreateInternedId(JSON.stringify(user));
			attributionRefs.push(ref);
		}

		let prev = 0;
		for (let i = 0; i < timestamps.length; i++) {
			deltaTimestamps[i] = timestamps[i] - prev;
			prev = timestamps[i];
		}

		const serialized: SerializedAttributor = {
			interner: interner.getSerializable(),
			seqs,
			timestamps: deltaTimestamps,
			attributionRefs
		};

		const unzipped = new TextEncoder().encode(JSON.stringify(serialized));
		const zipped = gzip(unzipped);
		const zippedStr = bufferToString(zipped, "base64");
		return zippedStr;
	}

	// Unpictured:
	// - GC (there are several ways to hook this up, though one can check the data structure should support it in O(n))
}
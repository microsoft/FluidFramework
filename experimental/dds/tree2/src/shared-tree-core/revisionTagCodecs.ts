import { IJsonCodec } from "../codec";
import { RevisionTag } from "../core";

export class RevisionTagCodec implements IJsonCodec<RevisionTag, RevisionTag> {
	public encode(tag: RevisionTag) {
		return tag;
	}
	public decode(tag: RevisionTag) {
		return tag;
	}
}

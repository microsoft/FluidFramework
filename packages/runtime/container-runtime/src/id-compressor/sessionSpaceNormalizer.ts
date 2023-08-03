import { AppendOnlySortedMap } from "./appendOnlySortedMap";
import { LocalCompressedId } from "./test/id-compressor/testCommon";
import { compareFiniteNumbersReversed } from "./utilities";

export class SessionSpaceNormalizer {
	private readonly leadingLocals = new AppendOnlySortedMap<LocalCompressedId, number>(
		compareFiniteNumbersReversed,
	);

	public get contents(): Pick<
		AppendOnlySortedMap<LocalCompressedId, number>,
		"size" | "entries"
	> {
		return this.leadingLocals;
	}

	public addLocalRange(baseLocal: LocalCompressedId, count: number): void {
		const last = this.leadingLocals.last();
		if (last !== undefined) {
			const [lastLocal, lastCount] = last;
			if (lastLocal - lastCount === baseLocal) {
				this.leadingLocals.replaceLast(lastLocal, lastCount + count);
				return;
			}
		}
		this.leadingLocals.append(baseLocal, count);
	}

	public contains(query: LocalCompressedId): boolean {
		const containingBlock = this.leadingLocals.getPairOrNextLower(query);
		if (containingBlock !== undefined) {
			const [startingLocal, count] = containingBlock;
			if (query >= startingLocal - (count - 1)) {
				return true;
			}
		}
		return false;
	}

	public equals(other: SessionSpaceNormalizer): boolean {
		if (this.leadingLocals.size !== other.leadingLocals.size) {
			return false;
		}
		for (let i = 0; i < this.leadingLocals.size; i++) {
			const pairThis = this.leadingLocals.getAtIndex(i);
			const pairOther = other.leadingLocals.getAtIndex(i);
			if (
				pairThis === undefined ||
				pairOther === undefined ||
				pairThis[0] !== pairOther[0] ||
				pairThis[1] !== pairOther[1]
			) {
				return false;
			}
		}
		return true;
	}
}

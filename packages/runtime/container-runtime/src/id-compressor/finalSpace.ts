import { assert } from "./copied-utils";
import { IdCluster, Session, clustersEqual } from "./sessions";
import { FinalCompressedId } from "./test/id-compressor/testCommon";

export class FinalSpace {
	private readonly clusterList: IdCluster[] = [];

	public get clusters(): readonly IdCluster[] {
		return this.clusterList;
	}

	public getTailCluster(): IdCluster | undefined {
		return this.clusterList.length === 0
			? undefined
			: this.clusterList[this.clusterList.length - 1];
	}

	public addCluster(newCluster: IdCluster) {
		const tailCluster = this.getTailCluster();
		assert(
			tailCluster === undefined || newCluster.baseFinalId > tailCluster.baseFinalId,
			"Cluster insert to final_space is out of order.",
		);
		this.clusterList.push(newCluster);
	}

	public getContainingCluster(finalId: FinalCompressedId): IdCluster | undefined {
		return Session.getContainingCluster(finalId, this.clusterList);
	}

	public getFinalIdLimit(): FinalCompressedId {
		if (this.clusterList.length === 0) {
			return 0 as FinalCompressedId;
		}
		const lastCluster = this.clusterList[this.clusterList.length - 1];
		return ((lastCluster.baseFinalId as number) + lastCluster.count) as FinalCompressedId;
	}

	public equals(other: FinalSpace): boolean {
		for (let i = 0; i < this.clusterList.length; i++) {
			if (!clustersEqual(this.clusterList[i], other.clusterList[i])) {
				return false;
			}
		}
		return this.clusterList.length === other.clusterList.length;
	}
}

import * as assert from "assert";
import * as MergeTree from "..";

describe("MergeTree.Client", () => {

    const localUserLongId = "localUser";
    let client: MergeTree.Client;

    beforeEach(() => {
        client = new MergeTree.Client("");

        client.startCollaboration(localUserLongId);
    });

    describe(".findTile", () => {
        it("Find non preceding tile based on label", () => {
            const tileLabel = "EOP";

            client.insertMarkerLocal(
                0,
                MergeTree.ReferenceType.Tile,
                {
                    [MergeTree.reservedTileLabelsKey]: [tileLabel],
                    [MergeTree.reservedMarkerIdKey]: "some-id",
                });

            client.insertTextLocal("abc", 0);

            console.log(client.getText());

            assert.equal(client.getLength(), 4, "length not expected");

            const tile = client.mergeTree.findTile(0, client.getClientId(), tileLabel, false);

            assert(tile, "Returned tile undefined.");

            assert.equal(tile.pos, 3, "Tile with label not at expected position");
        });
    });
});

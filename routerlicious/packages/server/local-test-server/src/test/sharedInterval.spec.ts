import { ISharedObjectExtension } from "@prague/api-definitions";
import { registerDefaultValueType } from "@prague/map";
import { IntervalType } from "@prague/merge-tree";
import {
    SharedIntervalCollectionValueType,
    SharedIntervalCollectionView,
    SharedString,
    SharedStringExtension,
    SharedStringInterval,
    SharedStringIntervalCollectionValueType,
} from "@prague/sequence";
import * as assert from "assert";
import { TestHost } from "..";

// tslint:disable-next-line:mocha-no-side-effect-code
const testTypes: ReadonlyArray<[string, ISharedObjectExtension]> = [
    [SharedStringExtension.Type, new SharedStringExtension()],
];

registerDefaultValueType(new SharedStringIntervalCollectionValueType());
registerDefaultValueType(new SharedIntervalCollectionValueType());

const assertIntervalsHelper = (
    sharedString: SharedString,
    intervals: SharedIntervalCollectionView<SharedStringInterval>,
    expected: ReadonlyArray<{start: number; end: number}>,
) => {
    const actual = intervals.findOverlappingIntervals(0, sharedString.client.getLength() - 1);
    assert.strictEqual(actual.length, expected.length,
        `findOverlappingIntervals() must return the expected number of intervals`);

    for (const actualInterval of actual) {
        const start = sharedString.localRefToPos(actualInterval.start);
        const end = sharedString.localRefToPos(actualInterval.end);
        let found = false;

        console.log(`[${start},${end}): ${sharedString.getText().slice(start, end)}`);

        for (const expectedInterval of expected) {
            if (expectedInterval.start === start && expectedInterval.end === end) {
                found = true;
                break;
            }
        }

        assert(found, `Unexpected interval [${start}..${end})`);
    }
};

describe("SharedInterval", () => {
    describe("one client", () => {
        let host: TestHost;
        let sharedString: SharedString;
        let intervals: SharedIntervalCollectionView<SharedStringInterval>;

        const assertIntervals = (expected: ReadonlyArray<{start: number; end: number}>) => {
            assertIntervalsHelper(sharedString, intervals, expected);
        };

        beforeEach(async () => {
            host = new TestHost([], testTypes);
            sharedString = await host.createType("text", SharedStringExtension.Type);
            sharedString.insertText("012", 0);
            intervals = await sharedString.getSharedIntervalCollection("intervals").getView();
        });

        afterEach(async () => {
            await host.close();
        });

        it("replace all is included", async () => {
            // Temporarily, append a padding character to the initial string to work around #1761:
            // (See: https://github.com/Microsoft/Prague/issues/1761)
            sharedString.insertText(".", 3);

            intervals.add(0, 3, IntervalType.Simple);
            assertIntervals([{ start: 0, end: 3 }]);

            sharedString.replaceText(0, 3, `xxx`);
            assertIntervals([{ start: 0, end: 3 }]);
        });

        it("remove all yields empty range", async () => {
            // Temporarily, appending a padding character to the initial string to work around #1761:
            // (See: https://github.com/Microsoft/Prague/issues/1761)
            sharedString.insertText(".", 3);
            intervals.add(0, 3, IntervalType.Simple);
            assertIntervals([{ start: 0, end: 3 }]);

            sharedString.removeRange(0, 3);
            assertIntervals([{ start: 0, end: 0 }]);
        });

        it("replace before is excluded", async () => {
            intervals.add(1, 2, IntervalType.Simple);
            assertIntervals([{ start: 1, end: 2 }]);

            sharedString.replaceText(0, 1, `x`);
            assertIntervals([{ start: 1, end: 2 }]);
        });

        it("insert at first position is excluded", async () => {
            intervals.add(0, 2, IntervalType.Simple);
            assertIntervals([{ start: 0, end: 2 }]);

            sharedString.insertText(".", 0);
            assertIntervals([{ start: 1, end: 3 }]);
        });

        it("replace first is included", async () => {
            sharedString.insertText("012", 0);
            intervals.add(0, 2, IntervalType.Simple);
            assertIntervals([{ start: 0, end: 2 }]);

            sharedString.replaceText(0, 1, `x`);
            assertIntervals([{ start: 0, end: 2 }]);
        });

        it("replace last is included", async () => {
            sharedString.insertText("012", 0);
            intervals.add(0, 2, IntervalType.Simple);
            assertIntervals([{ start: 0, end: 2 }]);

            sharedString.replaceText(1, 2, `x`);
            assertIntervals([{ start: 0, end: 2 }]);
        });

        it("insert at last position is included", async () => {
            intervals.add(0, 2, IntervalType.Simple);
            assertIntervals([{ start: 0, end: 2 }]);

            sharedString.insertText(".", 2);
            assertIntervals([{ start: 0, end: 3 }]);
        });

        it("insert after last position is excluded", async () => {
            intervals.add(0, 2, IntervalType.Simple);
            assertIntervals([{ start: 0, end: 2 }]);

            sharedString.insertText(".", 3);
            assertIntervals([{ start: 0, end: 2 }]);
        });

        it("replace after", async () => {
            intervals.add(0, 1, IntervalType.Simple);
            assertIntervals([{ start: 0, end: 1 }]);

            sharedString.replaceText(1, 2, `x`);
            assertIntervals([{ start: 0, end: 1 }]);
        });
    });

    describe("multiple clients", () => {
        it("propagates", async () => {
            const host1 = new TestHost([], testTypes);
            const sharedString1 = await host1.createType<SharedString>("text", SharedStringExtension.Type);
            sharedString1.insertText("0123456789", 0);
            const intervals1 = await sharedString1.getSharedIntervalCollection("intervals").getView();
            intervals1.add(1, 7, IntervalType.Simple);
            assertIntervalsHelper(sharedString1, intervals1, [{ start: 1, end: 7 }]);

            const host2 = host1.clone();
            await TestHost.sync(host1, host2);

            const sharedString2 = await host2.getType<SharedString>("text");
            const intervals2 = await sharedString2.getSharedIntervalCollection("intervals").getView();
            assertIntervalsHelper(sharedString2, intervals2, [{ start: 1, end: 7 }]);

            sharedString2.removeRange(4, 5);
            assertIntervalsHelper(sharedString2, intervals2, [{ start: 1, end: 6 }]);

            sharedString2.insertText("x", 4);
            assertIntervalsHelper(sharedString2, intervals2, [{ start: 1, end: 7 }]);

            await TestHost.sync(host1, host2);
            assertIntervalsHelper(sharedString1, intervals1, [{ start: 1, end: 7 }]);
        });
    });
});

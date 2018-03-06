import * as fs from "fs";
import * as MergeTree from "./mergeTree";
import * as ops from "./ops";

// tslint:disable

export function loadTextFromFile(filename: string, mergeTree: MergeTree.MergeTree, segLimit = 0) {
    let content = fs.readFileSync(filename, "utf8");
    return loadText(content, mergeTree, segLimit);
}

export function loadTextFromFileWithMarkers(filename: string, mergeTree: MergeTree.MergeTree, segLimit = 0) {
    let content = fs.readFileSync(filename, "utf8");
    return loadText(content, mergeTree, segLimit, true);
}

export function loadSegments(content: string, segLimit: number, markers = false) {
    content = content.replace(/^\uFEFF/, "");
    const seq = MergeTree.UniversalSequenceNumber;
    const cli = MergeTree.LocalClientId;
    let withProps = true;

    let paragraphs = content.split('\r\n');
    for (let i = 0, len = paragraphs.length; i < len; i++) {
        paragraphs[i] = paragraphs[i].replace(/\r\n/g, ' ').replace(/\u201c|\u201d/g, '"').replace(/\u2019/g, "'");
        if (!markers && i !== paragraphs.length - 1) {
            paragraphs[i] += "\n";
        }
    }

    let segments = <MergeTree.Segment[]>[];
    for (let paragraph of paragraphs) {
        let pgMarker: MergeTree.Marker;
        if (markers) {
            pgMarker = MergeTree.Marker.make(ops.ReferenceType.Tile,
                { [MergeTree.reservedTileLabelsKey]: ["pg"] }, seq, cli);
        }
        if (withProps) {
            if (paragraph.indexOf("Chapter") >= 0) {
                if (markers) {
                    pgMarker.addProperties({ header: 2 });
                    segments.push(new MergeTree.TextSegment(paragraph, seq, cli));
                }
                else {
                    segments.push(MergeTree.TextSegment.make(paragraph, { fontSize: "140%", lineHeight: "150%" }, seq, cli));
                }
            } else {
                let emphStrings = paragraph.split("_");
                for (let i = 0, len = emphStrings.length; i < len; i++) {
                    if (i & 1) {
                        if (emphStrings[i].length > 0) {
                            segments.push(MergeTree.TextSegment.make(emphStrings[i], { fontStyle: "italic" }, seq, cli));
                        }
                    }
                    else {
                        if (emphStrings[i].length > 0) {
                            segments.push(new MergeTree.TextSegment(emphStrings[i], seq, cli));
                        }
                    }
                }
            }
        } else {
            segments.push(new MergeTree.TextSegment(paragraph, seq, cli));
        }
        if (markers) {
            segments.push(pgMarker);
        }
    }

    if (segLimit > 0) {
        segments.length = segLimit;
    }

    return segments;
}

export function loadText(content: string, mergeTree: MergeTree.MergeTree, segLimit: number, markers = false) {
    const segments = loadSegments(content, segLimit, markers);
    mergeTree.reloadFromSegments(segments);
    // console.log(`Number of Segments: ${segments.length}`);
    // console.log(`Height: ${mergeTree.getStats().maxHeight}`);
    //console.log(segTree.toString());
    return mergeTree;
}



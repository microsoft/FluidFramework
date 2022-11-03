/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import assert from "assert";

import { BundleComparison, BundleMetric } from "../BundleBuddyTypes";
import { totalSizeMetricName } from "./Constants";

const bundleDetailsTableHeader = `<table><tr><th>Metric Name</th><th>Baseline Size</th><th>Compare Size</th><th>Size Diff</th></tr>`;

/**
 * Generates the comment message for all Bundle Diffs with the commit hash of the baseline on the footer
 *
 * @param bundleDiff - bundle difference
 * @param baselineCommit - Commit hash for the baseline
 */
export function getCommentForBundleDiff(
    bundleComparison: BundleComparison[],
    baselineCommit: string,
) {
    const diffDetails = bundleComparison.map(getBundleDetails).reduce((prev, current) => {
        return prev + current;
    });

    const baselineFooter = getCommentFooter(baselineCommit);

    return diffDetails + baselineFooter;
}

/**
 * Gets a simple HTML message with the footer for the baseline commit
 *
 * @param message - the string to type as a message
 * @param baselineCommit - Commit hash for the baseline
 */
export function getSimpleComment(message: string, baselineCommit: string) {
    const baselineFooter = getCommentFooter(baselineCommit);

    return `<p>${message}</p>` + baselineFooter;
}

/**
 * Gets the footer HTML for the baseline commit
 *
 * @param baselineCommit
 */
function getCommentFooter(baselineCommit: string) {
    return `<hr><p>Baseline commit: ${baselineCommit}</p>`;
}

/**
 * Gets a Details block from a single BundleDiff, with a table of all its metrics
 *
 * @param bundleDiff
 */
function getBundleDetails(bundleDiff: BundleComparison) {
    const { bundleName, commonBundleMetrics } = bundleDiff;

    const metrics = Object.entries(commonBundleMetrics)
        .map(([metricName, { baseline, compare }]) => {
            return getMetricRow(metricName, baseline, compare);
        })
        .reduce((prev, current) => {
            return prev + current;
        }, bundleDetailsTableHeader);

    const totalMetric = commonBundleMetrics[totalSizeMetricName];

    assert(
        totalMetric,
        `Could not compute the total size for a bundle, missing metric with name ${totalSizeMetricName}`,
    );

    const totalParsedSizeDiff = totalMetric.compare.parsedSize - totalMetric.baseline.parsedSize;

    const formattedTotalDiff = formatDiff(totalParsedSizeDiff);
    const glyph = getColorGlyph(totalParsedSizeDiff);

    return `<details><summary><b>${glyph} ${bundleName}:</b> ${formattedTotalDiff}</summary>${metrics}</table></details>`;
}

/**
 * Gets a table row of a single BundleMetricDiff
 *
 * @param bundleDiff
 */
function getMetricRow(
    metricName: string,
    baselineMetric: BundleMetric,
    compareMetric: BundleMetric,
) {
    const parsedSizeDiff = compareMetric.parsedSize - baselineMetric.parsedSize;
    const glyph = getColorGlyph(parsedSizeDiff);

    return `<tr>
    <td>${metricName}</td>
    <td>${formatBytes(baselineMetric.parsedSize)}</td>
    <td>${formatBytes(compareMetric.parsedSize)}</td>
    <td>${glyph} ${formatDiff(parsedSizeDiff)}</td>
  </tr>`;
}

/**
 * Returns the number of bytes in a human readable format, with either +/- as a prefix
 *
 * @param bytes positive or negative number of bytes
 */
function formatBytes(bytes: number) {
    const base = 1024;
    const decimals = 2;
    const sizes = ["Bytes", "KB", "MB", "GB"];

    const exponent = Math.floor(Math.log(Math.abs(bytes)) / Math.log(base));

    return parseFloat((bytes / Math.pow(base, exponent)).toFixed(decimals)) + " " + sizes[exponent];
}

/**
 * Returns the number of bytes in a human readable format
 */
function formatDiff(bytes: number) {
    if (bytes === 0) {
        return "No change";
    }

    const sign = bytes < 0 ? "" : "+";

    return `${sign}${formatBytes(bytes)}`;
}

/**
 * Returns a colored glyph to indicate the change at a glance
 *
 * @param bytesDiff diff of bytes
 */
function getColorGlyph(bytesDiff: number) {
    if (bytesDiff === 0) {
        return '<span style="color: green">■</span>';
    }

    if (bytesDiff < 0) {
        return '<span style="color: green">⯆</span>';
    }

    if (bytesDiff < 50000 /* 50 KB */) {
        return '<span style="color: coral">⯅</span>';
    }

    return '<span style="color: red">⯅</span>';
}

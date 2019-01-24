import * as charts from "@ms/charts";

// Endpoints that actually render a chart
export const VisualEndpoints = ["SVG", "Canvas"];

// All supported endpoints
export const AllEndpoints = VisualEndpoints.concat(["JSON"]);

/**
 * Returns the renderer that maps to the specified endpoint
 */
export function getRendererForEndpoint(endpoint: string): charts.IvyRenderer {
    switch (endpoint) {
        case "Image":
            return charts.IvyRenderer.Image;
        case "SVG":
            return charts.IvyRenderer.Svg;
        case "Canvas":
            return charts.IvyRenderer.Canvas;
        case "JSON":
            return charts.IvyRenderer.JSON;
        default:
            throw new Error("Unknown endpoint");
    }
}

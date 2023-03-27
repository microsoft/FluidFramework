# @fluid-experimental/attributable-map

## Overview

Attribution is designed and utilized to record the information about who created or modified content and the time of those actions. Applications often require attribution at a detailed level, as such, SharedMap can serve as the primary entry point for attributing content. Therefore, SharedMap should offer a way to retrieve attribution keys from its content. The goal of this experimental package is to demonstrate the use of attribution-related APIs and gather feedback on their suitability for integration with SharedMap, similar to the way [SharedCell](../../../packages/dds/cell/README.md) is integrated.

The original description of SharedMap and its related API can be found in [this page](../../../packages/dds/map/README.md). To distinguish it from the original data structure, the experimental data structure that integrates the attribution API has been temporarily named AttributableSharedMap.


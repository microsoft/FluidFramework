export const IComponentClipboardData = "IComponentClipboardData";
/**
 * During copy, component hosts can use their “selection” or equivalent concept to identify any nested
 * components involved. If the selection includes nested components, the host component should use the
 * **IComponentClipboardData** interface on each of these nested component to acquire their contribution
 * to the copied content, and combine it with its own copied content. These nested components should do the
 * same with their own nested components. What content a component provides is entirely up to it.
 *
 * Nested components might need to contribute multiple formats of clipboard data to their host components
 * (e.g. plain-text, HTML).
 *
 * In addition, a nested component should specify their complete fluid url in the **fluidUrlAttributeName**
 * data- attribute of its containing HTML element to ensure that the proper component is instantiated on paste.
 *
 * Disclaimer: These interfaces are experimental and are subject to change.
 */
export const fluidUrlAttributeName = "fluidUrl";
//# sourceMappingURL=componentClipboardProvider.js.map
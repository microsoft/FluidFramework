/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import Vue from "vue";
import PropTypes from "prop-types";
import { FluidReactComponent, getFluidState } from "@fluidframework/react";

// TODO: Create a standalone FluidVueComponent that requires no React dependencies
// In the meantime, reusing the FluidReactComponent provides us the full synced state capabilities
// that we have already developed and easily extend it to other frameworks such as Vue & Angular
// Reasons that I have picked React as the common HoC renderer to start with:
// 1) It is *very* efficient at calculating prop differences, allowing DDS changes to be quickly diffed before
// being passed as props to other view frameworks. We are also not copying the DDS again but instead passing its
// reference from the Fluid state is returned by getFluidState, so we shouldn't be increasing memory usage.
// 2) ReactDOM.render handles dependency installation. One of the biggest roadblocks I faced was how to
// 2) React is the smallest library of the three major UI frameworks by a good margin, and its package footprint is
// much smaller than Fluid itself. Ref: https://bit.ly/3fuA0bF
// 3) While it is still additional code over vanilla JS, the React view framework also provides view lifecycle methods
// which make it easier to build additional wrappers for other frameworks while providing appropriate initializing and
// cleanup support. We would need to write a common library for doing this if dealing with vanilla JS,
// and React already gives this to us through methods such as componentWillUnmount.
// 4) The JSX entry syntax of just passing the framework specific component as a React prop, i.e. vueComponent, is
// easy-to-understand and allows users to "drop-in" their framework specific component into the renderVue function.
// They then automatically see their DDS available to them in their component through the component's props.
export class FluidVueComponent extends FluidReactComponent {
    static propTypes = {
        vueComponent: PropTypes.any,
        on: PropTypes.func,
    };

    constructor(props) {
        super(props);
        this.currentVueComponent = props.component;
    }

    componentWillUnmount() {
        this.vueInstance.$destroy();
    }

    _internalCreateVueInstance(targetElement) {
        const { vueComponent, on, syncedComponent, syncedStateId } = this.props;
        const currentFluidState = getFluidState(
            syncedStateId,
            syncedComponent.syncedState,
            syncedComponent.dataProps.fluidComponentMap,
            this._fluidToView,
        );

        this.vueInstance = new Vue({
            el: targetElement,
            data: currentFluidState,
            render: (createElement) => createElement(
                "internal_vue_component",
                {
                    props: currentFluidState,
                    on,
                },
                <div/>,
            ),
            components: {
                ["internal_vue_component"]: vueComponent,
            },
        });
    }

    render() {
        return <div ref={(ref) => this._internalCreateVueInstance(ref)} />;
    }
}

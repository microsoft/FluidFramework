import React from "react";
/**
 * Given a SharedCell will produce a collaborative checkbox.
 */
export class CollaborativeCheckbox extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            checked: this.isChecked(),
        };
        this.updateCheckbox = this.updateCheckbox.bind(this);
        this.isChecked = this.isChecked.bind(this);
    }
    componentDidMount() {
        // Register a callback for when the value changes
        this.props.data.on("valueChanged", () => {
            const checked = this.isChecked();
            this.setState({ checked });
        });
    }
    render() {
        return (React.createElement("input", { type: "checkbox", className: this.props.className, style: this.props.style, "aria-checked": this.state.checked, name: this.props.id, checked: this.state.checked, onChange: this.updateCheckbox }));
    }
    updateCheckbox(e) {
        this.props.data.set(e.target.checked);
    }
    isChecked() {
        var _a;
        return (_a = this.props.data.get()) !== null && _a !== void 0 ? _a : false;
    }
}
//# sourceMappingURL=CollaborativeCheckbox.js.map
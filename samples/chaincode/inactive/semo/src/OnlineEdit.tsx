/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { debounce } from "lodash";
import { Icon, Label, Segment } from "semantic-ui-react";

const _autoReleaseEditTmeoutMs = 12 * 1000; // This should look right w.r.t the animation durations for the edit fadeout css.. see also similar number in SemObjectCard.js

// TODO: Add a collab blinking cursor? https://codepen.io/ArtemGordinsky/pen/GnLBq

// See https://github.com/kaivi/ReactInlineEdit/blob/master/README.md for info

function selectInputText(element) {
  element.setSelectionRange(0, element.value.length);
}

interface LeaseIndicatorProps {
  leaseOwnerName: string;
  leaseEndTime: number; // Date.now() value
}

class LeaseIndicator extends React.Component<LeaseIndicatorProps> {
  pendingRefreshTimeout: any = 0;
  cancelRefresh = () => {
    if (this.pendingRefreshTimeout) {
      clearTimeout(this.pendingRefreshTimeout);
      this.pendingRefreshTimeout = null;
    }
  };

  componentWillUnmount() {
    this.cancelRefresh();
  }

  componentWillReceiveProps() {
    this.cancelRefresh();
  }

  render() {
    const { leaseOwnerName, leaseEndTime } = this.props;

    if (!leaseOwnerName || leaseEndTime < Date.now()) return null;

    // We need to re-render if the time has elapsed or the lease has cleared
    this.pendingRefreshTimeout = setTimeout(() => this.forceUpdate(), 500);

    return (
      <span style={{ float: "right" }}>
        <Label circular size="mini" as="a" color="blue">
          {leaseOwnerName}
        </Label>
      </span>
    );
  }
}

interface OnlineEditProps {
  reservedSpace?: string;
  text: string;
  paramName: string;
  onChange: Function;
  onFinishEdit: Function; // Commit, cancel, blur etc
  sendPartialChanges: boolean;
  placeholder: string;
  leaseOwnerName: string;
  leaseEndTime: number; // Date.now() value
  fluid: boolean;
  className?: string;
  activeClassName?: string;
  minLength?: number;
  maxLength?: number;
  validate?: Function;
  style?: object;
  editingElement?: string;
  staticElement?: string;
  stopPropagation?: boolean;
  tabIndex?: number;
  isDisabled: boolean;
  editing?: boolean; // I will probably get rid of this.. it gets confusing
}

export default class OnlineEdit extends React.Component<OnlineEditProps> {

  _histories: any[] = [];

  static defaultProps = {
    reservedSpace: "2em",
    minLength: 1,
    maxLength: 256,
    editingElement: "input",
    staticElement: "span",
    tabIndex: 0,
    isDisabled: false,
    editing: false,
    stopPropagation: false
  };

  state = {
    editing: this.props.editing,
    text: this.props.text,
    minLength: this.props.minLength,
    maxLength: this.props.maxLength,

    inTimeBoxMode: false,
    inTimeBeforePos: 0,

    // See the .dg-was-changed-0 and .dg-was-changed-1 styles to understand what is going on here :)
    // It's because restarting animations in React is a bit weird. @todo ask Levi how to do this the right way once we settle on the desired UX
    changedAnimationIndex: undefined
  };

  triggerTextChangingTransition = () => {
    this.setState({
      changedAnimationIndex: 1 - this.state.changedAnimationIndex || 0
    });
  };

  finishImplicitylyAfterInactivity = debounce(() => {
    if (this.state.editing) {
      this.finishEditing();
      console.log(`User finished editing implicitly`);
    }
  }, _autoReleaseEditTmeoutMs);

  componentWillMount() {

// TODO allow this override.....    this.isInputValid = null !== this.props.validate || this.isInputValid;
    this._histories = [];
  }

  componentWillReceiveProps(nextProps) {
    const isTextChanged = nextProps.text !== this.props.text;
    const isEditingChanged = nextProps.editing !== this.props.editing;

    let nextState:any = {};
    if (isTextChanged) {
      nextState.text = nextProps.text;
      this.triggerTextChangingTransition();
    }
    if (isEditingChanged) nextState.editing = nextProps.editing;
    if (isTextChanged || isEditingChanged) this.setState(nextState);
  }

  componentDidUpdate(prevProps, prevState) {
    let inputElem:any = ReactDOM.findDOMNode(this.refs.input);
    if (this.state.editing && !prevState.editing) {
      inputElem.focus();
      selectInputText(inputElem);
    } else if (this.state.editing && prevProps.text != this.props.text) {
      //console.log("TODO: Decide how to handle stuff");
      //this.finishEditing()
    }
  }

  startEditing = e => {
    this.finishImplicitylyAfterInactivity();
    if (this.props.stopPropagation) e.stopPropagation();
    this.setState({ editing: true, text: this.props.text || "" });
  };

  finishEditing = () => {
    // TODO: This test isn't valid since we are live-updating props - cleanup logic here
    if (this.isInputValid(this.state.text) && this.props.text != this.state.text) this.commitEditing();
    else if (this.props.text === this.state.text || !this.isInputValid(this.state.text)) this.cancelEditing();
  };

  cancelEditing = () => {
    this.setState({ editing: false, text: this.props.text || "" });
    this.endTimeBoxMode();
    this.props.onFinishEdit(this.props.paramName);
  };

  sendCurrentValueToParent = () => {
    let dataChange = {};
    const input: any = this.refs.input
    dataChange[this.props.paramName] = input.value || ""; //this.state.text
    this.props.onChange(dataChange);
  };

  // Call this when there has been a change that hasn't been committed (i.e. Enter-key or blur)
  maybeSendCurrentPartialValueToParent = () => {
    if (this.props.sendPartialChanges) this.sendCurrentValueToParent();
  };

  commitEditing = () => {
    this.setState({ editing: false, text: this.state.text || "" });
    this.endTimeBoxMode();
    this.sendCurrentValueToParent();
    this.props.onFinishEdit(this.props.paramName);
  };

  clickWhenEditing = e => {
    // TODO: decide if click will re-establish the lease
    // People tend to click stuff absent mindedly so let's not claim until they actually edit
    // this.finishImplicitylyAfterInactivity()
    // this.triggerTextChangingTransition()
    if (this.props.stopPropagation) e.stopPropagation();
  };

  isInputValid = (text:string):boolean => {
    return text && text.length >= this.state.minLength && text.length <= this.state.maxLength;
  };

  keyDown = event => {
    //console.log("keyDown() ... Cursor at ", event.target.selectionStart);
    if (event.keyCode === 13) this.finishEditing();
    else if (event.keyCode === 27) this.cancelEditing();
  };

  keyUp = event => {
    //console.log("keyUp() ... Cursor at ", event.target.selectionStart);
    this.finishImplicitylyAfterInactivity();
  };

  textChanged = event => {
    //console.log("textChanged() ... Cursor at ", event.target.selectionStart);
    this.maybeSendCurrentPartialValueToParent();
    this.triggerTextChangingTransition();
    const text = event.target.value || "";
    this._histories.push(text);
    this.setState({ text });
  };

  onTimeScroll = event => {
    if (event.deltaY < 0 && this.state.inTimeBeforePos > 0)
      this.setState({
        inTimeBeforePos: this.state.inTimeBeforePos - 1,
        text: this._histories[this.state.inTimeBeforePos - 2]
      });
    if (event.deltaY > 0 && this.state.inTimeBeforePos < this._histories.length)
      this.setState({
        inTimeBeforePos: this.state.inTimeBeforePos + 1,
        text: this._histories[this.state.inTimeBeforePos]
      });
    event.stopPropagation();
    event.preventDefault();
  };

  onMouseEnterTimeBox = () => {
    this.setState({
      inTimeBoxMode: true,
      inTimeBeforePos: this._histories.length
    });
  };

  endTimeBoxMode = () => {
    this.setState({
      inTimeBoxMode: false,
      inTimeBeforePos: this._histories.length,
      text: this.props.text
    });
  };

  onMouseExitTimeBox = () => {
    this.endTimeBoxMode();
  };

  render() {
    const {
      activeClassName,
      className,
      fluid,
      reservedSpace,
      leaseOwnerName,
      leaseEndTime,
      paramName,
      editingElement,
      isDisabled,
      placeholder,
      style,
      staticElement,
      tabIndex
    } = this.props;
    const { text, editing, changedAnimationIndex, inTimeBoxMode, inTimeBeforePos } = this.state;

    const fluidStyle = fluid ? { display: "inline-block", minWidth: "100%" } : {};
    const placeholderOpacityStyle = text ? {} : { opacity: 0.4 };
    const fieldRecentlyChangedClassname =
      changedAnimationIndex === undefined ? null : `dg-was-changed-${changedAnimationIndex}`;

    if (isDisabled) {
      const Element:any = staticElement;
      return (
        <Element className={className} style={style} title="Editing disabled">
          {text || placeholder}
        </Element>
      );
    }

    if (!editing) {
      const Element:any = staticElement;
      const staticStyle = {
        ...placeholderOpacityStyle,
        ...style,
        display: "inline-block",
        float: "left",
        width: `calc(100% - ${reservedSpace})`,
        cursor: "pointer"
      };
      return (
        <span style={fluidStyle} onWheel={this.onTimeScroll}>
          <Element
            className={fieldRecentlyChangedClassname}
            onMouseEnter={this.onMouseEnterTimeBox}
            onMouseLeave={this.onMouseExitTimeBox}
            onClick={this.startEditing}
            onKeyDown={this.startEditing}
            tabIndex={tabIndex}
            title={`Click to edit this (${paramName})`}
            style={staticStyle}
          >
            {text || placeholder}
          </Element>
          <LeaseIndicator leaseOwnerName={leaseOwnerName} leaseEndTime={leaseEndTime} />
          <span style={{ float: "right" }}>
            {inTimeBoxMode && (
              <Icon
                color="blue"
                style={{
                  transform: `rotate(${(inTimeBeforePos - this._histories.length) * 3}deg)`,
                  opacity: 0.8
                }}
                name="history"
              />
            )}
          </span>
        </span>
      );
    }

    // Editing...
    const Element:any = editingElement;
    const isValid = this.isInputValid(text);
    const editingElementStyle = {
      ...placeholderOpacityStyle,
      ...style,
      display: "inline-block",
      width: `calc(100% - ${reservedSpace})`,
      resize: "none", // For when we use TextArea
      color: isValid ? null : "red"
    };
    return (
      <Segment basic style={{ padding: "0" }}>
        <span style={fluidStyle}>
          <Element
            onClick={this.clickWhenEditing}
            onKeyDown={this.keyDown}
            onKeyUp={this.keyUp}
            onBlur={this.finishEditing}
            title={`You are live editing this field (${paramName})`}
            className={activeClassName + " " + fieldRecentlyChangedClassname}
            placeholder={placeholder}
            defaultValue={this.state.text}
            onChange={this.textChanged}
            style={editingElementStyle}
            ref="input"
          />
          <LeaseIndicator leaseOwnerName={leaseOwnerName} leaseEndTime={leaseEndTime} />
        </span>
      </Segment>
    );
  }
}

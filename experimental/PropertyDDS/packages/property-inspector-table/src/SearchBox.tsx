/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Fade from "@material-ui/core/Fade";
import LinearProgress from "@material-ui/core/LinearProgress";
import TextField from "@material-ui/core/TextField";
import { makeStyles } from "@material-ui/styles";
import classNames from "classnames";
import * as React from "react";
import {
  backGroundDarkColor,
  backGroundLightColor,
  iconBaseColor,
  iconHeight,
  iconHoverColor,
  iconWidth,
  Omit,
} from "./constants";
import { SvgIcon } from "./SVGIcon";

export interface ISearchBoxProps extends Omit<React.HTMLProps<HTMLInputElement>, "value"> {
  searchExpression: string;
  onClear?: () => void;
  onClose?: () => void;
  onNext?: (newIndex: number) => void;
  onPrevious?: (newIndex: number) => void;
  totalResults?: number;
  currentResult?: number;
  searchInProgress?: boolean;
}

const useStyles = makeStyles({
  alignedItem: {
    alignSelf: "center",
  },
  backGroundToggle: {
    "&:hover": {
      background: backGroundDarkColor,
      fill: iconHoverColor,
    },
    "background": backGroundLightColor,
    "fill": iconBaseColor,
  },
  hoverableItem: {
    cursor: "pointer",
  },
  input: {
    fontSize: "12px",
    marginLeft: "5px",
    marginRight: "5px",
    outline: "none",
  },
  navigationGroup: {
    borderRadius: "2px",
    display: "flex",
    height: "12px",
  },
  navigationIcon: {
    fill: "inherit",
  },
  progressBarColorPrimary: {
    backgroundImage: "linear-gradient(to right, white,#0696d7, white);",
  },
  progressBarRoot: {
    borderRadius: "0px 0px 9px 9px",
    bottom: "0px",
    marginLeft: "2px",
    marginRight: "2px",
    position: "relative",
  },
  progressColorPrimary: {
    backgroundColor: "#FFFFFF",
  },
  resultsCount: {
    color: "#999999",
    fontSize: "9px",
    marginLeft: "5px",
    marginRight: "5px",
    whiteSpace: "nowrap",
  },
  root: {
    "& .MuiOutlinedInput-root": {
      "& input": {
        fontWeight: "normal",
        padding: "inherit",
        paddingLeft: "5px",
        paddingRight: "5px",
      },
    },
  },
}, { name: "SearchBox" });

export const SearchBox: React.FunctionComponent<ISearchBoxProps> =
  ({
    searchExpression,
    searchInProgress,
    currentResult,
    onClose,
    onClear,
    onNext,
    onPrevious,
    totalResults,
    onChange,
  }) => {
    const classes = useStyles();
    const inputReference = React.createRef<HTMLInputElement>();
    const [expanded, setExpanded] = React.useState(false);
    const getNewResultIndex = (delta: number) => {
      if (currentResult !== undefined && currentResult >= 0 && totalResults !== undefined) {
        const newResult = currentResult + delta;
        return (newResult > totalResults ? 0 : (newResult < 0 ? totalResults - 1 : newResult));
      } else {
        return -1;
      }
    };
    const changeResultEnabled = totalResults !== undefined && totalResults > 0 && !searchInProgress;
    const handlePrevious = () => (onPrevious && changeResultEnabled && onPrevious(getNewResultIndex(-1)));
    const handleNext = () => (onNext && changeResultEnabled && onNext(getNewResultIndex(1)));
    const handleOnClear = () => (onClear && onClear());
    const handleOnClose = () => (onClose && onClose());
    const handleKeyDown = (event) => {
      if (event.key === "Enter") {
        if (event.shiftKey) {
          handlePrevious();
        } else {
          handleNext();
        }
      } else if (event.key === "Escape") {
        handleOnClose();
      }
    };

    const endAdornment = (
      <>
        {
          expanded &&
          <>
            <div style={{ display: "flex", visibility: searchExpression ? "visible" : "hidden" }}>
              <div className={classNames(classes.alignedItem, classes.resultsCount)}>
                {currentResult == null ? 0 : currentResult + 1} of {totalResults || 0}
              </div>
              <div className={classNames(classes.alignedItem, classes.navigationGroup)}>
                <div
                  key="previous"
                  className={classNames(classes.alignedItem,
                    { [classes.backGroundToggle]: totalResults && !searchInProgress },
                    { [classes.hoverableItem]: totalResults && !searchInProgress })}
                  onClick={handlePrevious}
                >
                  <SvgIcon
                    className={classNames({ [classes.navigationIcon]: totalResults })}
                    height="9px"
                    svgId={"up"}
                  />
                </div>
                <div
                  key="next"
                  className={classNames(classes.alignedItem,
                    { [classes.backGroundToggle]: totalResults && !searchInProgress },
                    { [classes.hoverableItem]: totalResults && !searchInProgress })}
                  onClick={handleNext}
                >
                  <SvgIcon
                    className={classNames({ [classes.navigationIcon]: totalResults })}
                    height="9px"
                    svgId={"down"}
                  />
                </div>
              </div>
            </div>
            <div
              key="close"
              className={classNames(classes.alignedItem, classes.hoverableItem)}
              onClick={() => {
                handleOnClear();
                handleOnClose();
                setExpanded(false);
              }
              }
            >
              <SvgIcon svgId={"clear-24"} hoverable />
            </div>
          </>
        }
      </>);

    return (
      <div style={{ transition: "width 0.25s", width: expanded ? "100%" : "50%", minWidth: "120px" }}>
        <TextField
          onChange={onChange as any}
          onKeyDown={handleKeyDown}
          value={searchExpression}
          placeholder="Search"
          margin="none"
          classes={{ root: classes.root }}
          variant="outlined"
          inputRef={inputReference}
          InputProps={{
            className: classes.input,
            endAdornment,
            onBlur: () => { if (!searchExpression) { setExpanded(false); } },
            onFocus: () => { setExpanded(true); },
            startAdornment: <><SvgIcon
              onClick={() => { inputReference.current!.focus(); }}
              svgId={"search-16"}
              hoverable
              width={iconWidth}
              height={iconHeight}
            />
            <div style={{ position: "absolute", left: "0px", bottom: "1px", width: "100%" }}>
              <Fade in={searchInProgress} style={{ transitionDelay: "800ms" }}>
                <LinearProgress
                  classes={{
                    barColorPrimary: classes.progressBarColorPrimary,
                    colorPrimary: classes.progressColorPrimary,
                    root: classes.progressBarRoot,
                    }}
                  style={{
                    height: expanded ? 3 : 1,
                  }}
                />
              </Fade>
            </div>
            </>,
          }}
        />
      </div>
    );
  };

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as React from 'react';

type Props = {
  children(data: { width: number, height: number }): React.ReactElement;
}

const MochAutoSizer: React.FunctionComponent<Props> = (props) => {
  return (
    <div>
      { props.children({ width: 200, height: 200 }) }
    </div>
  )
}

export default MochAutoSizer;

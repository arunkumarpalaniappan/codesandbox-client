import Tooltip from '@codesandbox/common/es/components/Tooltip';
import React, { FunctionComponent } from 'react';

type Props = {
  disableTooltip: boolean;
  loggedIn: boolean;
  title: string;
};
export const MaybeTooltip: FunctionComponent<Props> = ({
  children,
  disableTooltip,
  loggedIn,
  title,
}) =>
  loggedIn && !disableTooltip ? (
    <Tooltip content={title} style={{ display: 'flex' }}>
      {children}
    </Tooltip>
  ) : (
    <>{children}</>
  );

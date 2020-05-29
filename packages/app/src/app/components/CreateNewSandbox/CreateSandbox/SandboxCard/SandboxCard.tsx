import { TemplateType } from '@codesandbox/common/es/templates';
import { getTemplateIcon } from '@codesandbox/common/es/utils/getTemplateIcon';
import React from 'react';

import {
  Container,
  Detail,
  Details,
  Icon,
  Owner,
  Row,
  Title,
} from './elements';

interface ISandboxCardProps {
  title: string;
  iconUrl: string;
  environment: TemplateType;
  color: string;
  owner?: string;
  official?: boolean;
  focused?: boolean;
  detailText?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  onFocus?: (e: React.FocusEvent<HTMLButtonElement>) => void;
  onKeyPress?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  onMouseOver?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  DetailComponent?: React.FunctionComponent;
}

export const SandboxCard: React.FC<ISandboxCardProps> = ({
  title,
  iconUrl,
  environment,
  official,
  color,
  focused,
  detailText,
  onClick,
  onFocus,
  onKeyPress,
  onMouseOver,
  DetailComponent,
  owner,
}) => {
  const elRef = React.useRef<HTMLButtonElement>();
  const { OfficialIcon, UserIcon } = getTemplateIcon(iconUrl, environment);

  React.useEffect(() => {
    const inputHasFocus =
      document.activeElement && document.activeElement.tagName === 'INPUT';
    if (focused && elRef.current && !inputHasFocus) {
      elRef.current.focus();
    }
  }, [focused]);

  return (
    <Container
      ref={elRef}
      onClick={onClick}
      onMouseOver={onMouseOver}
      onFocus={onFocus}
      onKeyPress={onKeyPress}
      tabIndex={focused ? 0 : -1}
      focused={focused}
    >
      <Icon color={color}>
        {official && OfficialIcon ? <OfficialIcon /> : <UserIcon />}
      </Icon>
      <Details>
        <Row>
          <Title>{title}</Title>

          {focused && DetailComponent && <DetailComponent />}
        </Row>
        <Row>
          <Owner>{owner ? `by ${owner}` : ''}</Owner>

          {detailText && <Detail>{detailText}</Detail>}
        </Row>
      </Details>
    </Container>
  );
};

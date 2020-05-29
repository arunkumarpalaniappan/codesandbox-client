import { dashboardUrl } from '@codesandbox/common/es/utils/url-generator';
import { Element, Stack, ThemeProvider } from '@codesandbox/components';
import codeSandboxBlack from '@codesandbox/components/lib/themes/codesandbox-black';
import { css } from '@styled-system/css';
import { useOvermind } from 'app/overmind';
import React, { useEffect } from 'react';
import { Redirect } from 'react-router-dom';

import { Navigation } from '../common/Navigation';
import { SignInModalElement } from './Modal';

const SignIn = () => {
  const {
    state,
    actions: { genericPageMounted },
  } = useOvermind();
  const redirectTo = new URL(location.href).searchParams.get('continue');

  useEffect(() => {
    genericPageMounted();
  }, [genericPageMounted]);

  if (state.hasLogIn && !redirectTo) {
    return <Redirect to={dashboardUrl()} />;
  }

  return (
    <ThemeProvider theme={codeSandboxBlack}>
      <Element
        css={css({
          backgroundColor: 'sideBar.background',
          minHeight: '100vh',
          fontFamily: 'Inter, sans-serif',
          overflow: 'hidden',
        })}
      >
        <Navigation title="Sign In" />
        <Stack
          css={css({
            width: '100vw',
            height: '100%',
            marginBottom: 100,
          })}
          align="center"
          justify="center"
        >
          <SignInModalElement redirectTo={redirectTo} />
        </Stack>
      </Element>
    </ThemeProvider>
  );
};

export default SignIn;

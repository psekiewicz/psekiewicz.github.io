import React from 'react';

import { FatalError } from './FatalError';

type Props = { children: React.ReactNode };
type State = { error: unknown };

/**
 * Catches anything thrown while rendering.
 *
 * Without this, a single bad render takes the whole process down: a release
 * build has no red box to fall back on, so the app simply vanishes and the
 * person holding the phone has nothing to report but "it closed". Turning that
 * into a screen with the message on it is the difference between a bug that
 * can be fixed and one that can only be guessed at.
 *
 * Must be a class — there is still no hook equivalent of componentDidCatch.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <FatalError error={this.state.error} where="rendering the app" />;
    }
    return this.props.children;
  }
}

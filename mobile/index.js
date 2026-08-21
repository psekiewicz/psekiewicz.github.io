import { registerRootComponent } from 'expo';
import React from 'react';

import { FatalError } from './src/components/FatalError';

// The imports below are deliberately `require` calls inside a try, not ES
// imports. An ES import is hoisted and evaluated before any statement in this
// file runs, so a module that throws while loading would take the process down
// before there was anything able to report it - which is precisely the failure
// that leaves a release build showing a splash screen and then nothing.
//
// FatalError is imported normally: it depends on nothing but React and
// react-native, so if *it* cannot load there is no version of this that helps.
let Root;
try {
  require('react-native-url-polyfill/auto');
  Root = require('./src/App').default;
} catch (error) {
  Root = () => React.createElement(FatalError, { error, where: "loading the app's modules" });
}

registerRootComponent(Root);

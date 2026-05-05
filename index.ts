// Polyfills required by @solana/web3.js, @coral-xyz/anchor, and MWA.
// MUST be imported before anything that touches crypto, URL, or Buffer.
import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import { Buffer } from "@craftzdog/react-native-buffer";
// @ts-expect-error — overwriting global Buffer with the RN-compatible impl
global.Buffer = Buffer;

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

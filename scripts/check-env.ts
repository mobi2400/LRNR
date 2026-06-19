import { clientConfig, serverConfig } from '../src/server/config';

const summary = {
  nodeEnv: serverConfig.nodeEnv,
  appUrl: serverConfig.appUrl,
  accessMode: serverConfig.accessMode,
  ownerConfigured:
    Boolean(serverConfig.owner.userId) || Boolean(serverConfig.owner.email),
  elevenLabsEnabled: serverConfig.elevenLabs.enabled,
  clientConfig,
};

console.log('Environment configuration is valid.');
console.log(JSON.stringify(summary, null, 2));

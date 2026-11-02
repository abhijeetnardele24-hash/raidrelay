import { buildApp } from './app.js';
import { config } from './config.js';

async function main() {
  const { app } = await buildApp();

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    console.info(`[RaidRelay] Server running at http://${config.HOST}:${config.PORT}`);
    console.info(`[RaidRelay] OBS Overlay available at http://${config.HOST}:${config.PORT}/overlay/demo-channel-key-12345`);
    console.info(`[RaidRelay] Broadcaster Console available at http://${config.HOST}:${config.PORT}/console`);
    console.info(`[RaidRelay] Demo Lab available at http://${config.HOST}:${config.PORT}/lab`);
  } catch (err) {
    console.error('[RaidRelay] Failed to start server:', err);
    process.exit(1);
  }
}

main();

import { createApp } from './app.js';
import { readConfig } from './config.js';
import { Store } from './store.js';

const config = readConfig(3000, true);
const store = new Store(config.databasePath);
const { app } = createApp(config, store);
const server = app.listen(config.port, '127.0.0.1', () => console.log('Sample ready at ' + config.origin));
const stop = () => {
  server.close(() => { store.close(); process.exit(0); });
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

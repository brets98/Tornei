import mongoose from 'mongoose';
import { createApp } from './app.js';
import { createAuth } from './auth/auth.js';
import { loadConfig } from './config.js';
import { createSmtpMailer } from './mail/mailer.js';

const config = loadConfig();

await mongoose.connect(config.mongodbUri);
console.log('Connected to MongoDB');

const auth = createAuth({
  db: mongoose.connection.db!,
  config: config.auth,
  mailer: createSmtpMailer(config.smtp),
});

const server = createApp({ auth }).listen(config.port, () => {
  console.log(`API listening on port ${config.port}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close();
  await mongoose.disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

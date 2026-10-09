function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig() {
  return {
    port: Number(process.env.PORT ?? 3000),
    mongodbUri: required('MONGODB_URI'),
  };
}

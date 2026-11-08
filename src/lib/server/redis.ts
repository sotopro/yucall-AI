import { createClient } from "redis";

// Redis of the VPS (REDIS_URL, rediss:// with the company CA via NODE_EXTRA_CA_CERTS).
// The yucall user may only touch keys under "yc:".
export const KEY_PREFIX = "yc:";

const makeClient = () => createClient({ url: process.env.REDIS_URL });
type Client = ReturnType<typeof makeClient>;
let client: Promise<Client> | null = null;

export function getRedis(): Promise<Client> {
  if (!client) {
    const c = makeClient();
    c.on("error", (error) => console.error("redis error", error));
    client = c.connect().catch((error) => {
      client = null;
      throw error;
    });
  }
  return client;
}

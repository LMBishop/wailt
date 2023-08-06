import { createClient } from 'redis';

export type RedisClientConnection = ReturnType<typeof createClient>

export const connectRedis = async (): Promise<RedisClientConnection> => {
    const redisClient = createClient({ url: process.env.REDIS_URI });
    await redisClient.connect();
    
    return redisClient;
}

export default connectRedis;


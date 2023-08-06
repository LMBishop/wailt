import dotenv from 'dotenv-defaults';
import { logger } from './logger.js'
import express from 'express';
import router from './routes/spotify.js';
import createWebsocket from './websocket/spotify.js';
import { WebSocketServer } from 'ws';
import { SpotifyClient } from './spotify/client.js';
import connectRedis from './config/redis.js';

dotenv.config()

const app = express();
app.set('view engine', 'ejs');
app.set('views', 'views');

app.use(router);

let redis;
try {
    redis = await connectRedis();
} catch (err) {
    logger.error(`Failed to connect to Redis: ${err.message}`);
    process.exit(1);
}
SpotifyClient.initialise(redis);

const server = app.listen(process.env.PORT, () => {
    logger.info(`App listening on port ${process.env.PORT}`);
});
const websocketServer: WebSocketServer = createWebsocket(server);

const exit = () => {
    logger.info('Stopping server...');
    websocketServer.clients.forEach(client => {
        client.terminate();
    });
    websocketServer.close();
    server.close(() => {
        process.exit(0);
    })
}
process.on('SIGINT', exit);
process.on('SIGTERM', exit);

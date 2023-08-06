import axios, { AxiosResponse } from 'axios';
import { logger } from '../logger.js';
import { WebSocket } from 'ws';
import { RedisClientConnection } from '../config/redis.js';

export namespace SpotifyClient {
    let clients = new Set<WebSocket>();
    let interval: NodeJS.Timeout;
    
    let authenticationFailed = false;

    let lastUpdate: any;
    let lastUpdateTimestamp: number;
    
    let redis: RedisClientConnection;

    export const addClient = (client: WebSocket) => {
        clients.add(client);
        if (lastUpdate && lastUpdateTimestamp > Date.now() - 10000) {
            client.send(JSON.stringify(lastUpdate));
        }
    }
    
    const apiTokenUrl = 'https://accounts.spotify.com/api/token';
    
    const spotifyClientHeaders = {    
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    
    export const setTokens = async (accessToken: string, refreshToken: string) => {
        logger.info('Re-identifying with Spotify');
        await redis.set('spotify_access_token', accessToken);
        await redis.set('spotify_refresh_token', refreshToken);
        authenticationFailed = false;
    }
    
    const refreshAccessToken = async () => {
        logger.info('Refreshing access token from Spotify');
        try {
            const refreshToken = await redis.get('spotify_refresh_token');
            const res = await axios.post(apiTokenUrl, {
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                    client_id: process.env.SPOTIFY_CLIENT_ID,
                    client_secret: process.env.SPOTIFY_CLIENT_SECRET
            }, { headers: spotifyClientHeaders });
            await redis.set('spotify_access_token', res.data.access_token);
            if (res.data.refresh_token) {
                await redis.set('spotify_refresh_token', res.data.refresh_token);
            }
            logger.info('Access token refreshed');
        } catch (err) {
            if (err.response?.data?.error) {
                logger.error(`Failed to refresh access token: ${err.message}: ${err.response.data.error}`);
            } else {
                logger.error(`Failed to refresh access token: ${err.message} (${err.response.status} ${err.response.statusText} ${err.response.data.error})`);
            }
            authenticationFailed = true;
        }
    }

    export const initialise = async (client: RedisClientConnection) => {
        redis = client;
        await refreshAccessToken();
        await updateTimeout();
    }
    
    const updateTimeout = async () => {
        const delay = await update();
        interval = setTimeout(updateTimeout, delay*1000);
    }
    
    const update = async (): Promise<number> => {
        if (authenticationFailed) {
            return 5;
        }

        clients.forEach(client => {
            if (client.readyState !== WebSocket.OPEN) {
                clients.delete(client);
            }
        });

        if (clients.size === 0) {
            return 1;
        } 

        try {
            const token = await redis.get('spotify_access_token');

            let res: AxiosResponse;
            try {
                res = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
                    headers: {
                        'Authorization': 'Bearer ' + token,
                    }
                });
            } catch (err) {
                if (err.response?.status === 401) {
                    await refreshAccessToken();
                    return 1;
                } else {
                    throw err;
                }
            }
            try {
                let update = {
                    title: res.data.item?.name,
                    duration: res.data.item?.duration_ms,
                    artist: res.data.item?.artists[0]?.name,
                    progress: res.data.progress_ms,
                    album: res.data.item?.album.name,
                    albumArt: res.data.item?.album.images[0]?.url,
                    url: res.data.item?.external_urls.spotify,
                    state: res.data.is_playing ? 'playing' : 'paused',
                }
                lastUpdate = update;
                lastUpdateTimestamp = Date.now();
                clients.forEach(client => {
                    client.send(JSON.stringify(update));
                });
            } catch (err) {
                logger.error(`Failed to parse and send current song: ${err.message}`);
            }
        } catch (err) {
            if (err.response?.data?.error?.message) {
                logger.error(`Failed to get current song: ${err.message}: ${err.response.data.error.message}`);
            } else {
                logger.error(`Failed to get current song: ${err.message} (${err.response.status} ${err.response.statusText} ${err.response.data.error})`);
            }
        }
        return 5;
    }
    
    export const stop = () => {
        clearInterval(interval);
        clients.forEach(client => client.close());
    }
    
}


import express from 'express';
import axios from 'axios';
import { logger } from '../logger.js';
import { SpotifyClient } from '../spotify/client.js';

export const router = express.Router({ mergeParams: true });

router.get('/auth', (req, res, next) => {
    let scope = 'user-read-currently-playing user-read-email user-read-private';
    let params = new URLSearchParams(); 
    params.append('response_type', 'code');
    params.append('client_id', process.env.SPOTIFY_CLIENT_ID);
    params.append('scope', scope);
    params.append('redirect_uri', process.env.SPOTIFY_REDIRECT_URI);
  
    res.redirect('https://accounts.spotify.com/authorize?' + params.toString());
});

router.get('/auth/callback', async (req, res, next) => {
    if (req.query.error) {
        res.send('Error: ' + req.query.error);
        return;
    }
    if (!req.query.code) {
        res.send('No code');
        return;
    }
    
    let accessToken: string;
    let refreshToken: string;
    try {
        const res = await axios.post('https://accounts.spotify.com/api/token', {
            grant_type: 'authorization_code',
            code: req.query.code,
            redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
            client_id: process.env.SPOTIFY_CLIENT_ID,
            client_secret: process.env.SPOTIFY_CLIENT_SECRET,
        }, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }});
        accessToken = res.data.access_token;
        refreshToken = res.data.refresh_token;
    } catch (err) {
        if (err.response?.query?.error) {
            res.send('Error: ' + err.response.query.error);
        } else {
            res.send('Error');
        }
        return;
    }
    
    try {
        const data = await axios.get('https://api.spotify.com/v1/me', { 
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        if (data.data.id !== process.env.SPOTIFY_USER_ID) {
            res.send("I don't want to authenticate with you :(");
            return;
        }
    } catch (err) {
        logger.error(`Failed to get user data: ${err.message} (${err.response.status} ${err.response.statusText} ${err.response.data.error})`);
        res.send('Error');
        return;
    }

    SpotifyClient.setTokens(accessToken, refreshToken);
    res.send('Tokens have been updated. You can close this window now.');
});

export default router;

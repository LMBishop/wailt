import { Server } from 'http';
import { WebSocketServer } from 'ws';
import { SpotifyClient } from '../spotify/client.js';

export const createWebsocketServer = (server: Server): WebSocketServer => {
    const wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req)
        })
    })

    wss.on('connection', (ws) => {
        SpotifyClient.addClient(ws);
    });
    
    return wss;
}

export default createWebsocketServer;

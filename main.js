const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');

const SESSION_FILE_PATH = './session.json';
let clientReady = false;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true,
        defaultViewport: null
    }
});

client.on('qr', (qr) => {
    console.log('QR Code received, scan it with your phone:');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('Authentication successful!');
});

client.on('ready', () => {
    console.log('Client is ready!');
    clientReady = true;
});

client.on('auth_failure', (message) => {
    console.error('Authentication failed:', message);
    clientReady = false;
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out:', reason);
    clientReady = false;
    // Attempt to reinitialize the client
    setTimeout(() => {
        client.initialize();
    }, 5000);
});

// Initialize client with error handling
const initializeClient = async () => {
    try {
        await client.initialize();
    } catch (error) {
        console.error('Failed to initialize client:', error);
        // Attempt to reinitialize after a delay
        setTimeout(initializeClient, 5000);
    }
};

initializeClient();

const app = express();
app.use(bodyParser.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: clientReady ? 'ready' : 'initializing',
        authenticated: client.authStrategy.authenticated
    });
});

// Endpoint to send a message
app.post('/send-message', async (req, res) => {
    const { number, message } = req.body;

    if (!number || !message) {
        return res.status(400).json({ 
            status: 'error', 
            message: 'Number and message are required.' 
        });
    }

    if (!clientReady) {
        return res.status(503).json({ 
            status: 'error', 
            message: 'WhatsApp client is not ready. Please try again later.' 
        });
    }

    const chatId = `${number}@c.us`;

    try {
        // Validate number format
        if (!/^\d+$/.test(number)) {
            throw new Error('Invalid phone number format');
        }

        // Check if number exists on WhatsApp
        const numberDetails = await client.isRegisteredUser(chatId);
        if (!numberDetails) {
            return res.status(404).json({ 
                status: 'error', 
                message: 'The provided number is not registered on WhatsApp.' 
            });
        }

        // Send the message
        await client.sendMessage(chatId, message);
        res.status(200).json({ 
            status: 'success', 
            message: 'Message sent successfully.' 
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Failed to send message: ' + error.message 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
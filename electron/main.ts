import { app, BrowserWindow, ipcMain } from 'electron';
import * as net from 'net';
import ProtocolParser from './ProtocolParser';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';

let mainWindow: BrowserWindow | null;

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// const assetsPath =
//   process.env.NODE_ENV === 'production'
//     ? process.resourcesPath
//     : app.getAppPath()

let socketClient: net.Socket;
let protocolParser: ProtocolParser;

function createWindow() {
    mainWindow = new BrowserWindow({
        // icon: path.join(assetsPath, 'assets', 'icon.png'),
        width: 1100,
        height: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
        },
    });

    mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
    mainWindow.setAlwaysOnTop(true);
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    protocolParser = new ProtocolParser((address, data) => {
        mainWindow?.webContents?.send('receive-from-bios', address[0], data);
    });

    socketClient = new net.Socket();

    socketClient.setNoDelay();
    socketClient.on('connect', () => {
        connectedToBios = true;
        reportBiosStatus();
    });
    socketClient.on('ready', () => {});
    socketClient.on('data', data => {
        const d = new DataView(data.buffer);
        for (let i = 0; i < d.byteLength; i++) {
            protocolParser.processChar(d.getUint8(i));
        }
    });
    socketClient.on('end', () => {
        console.log('disconnected from server');
        connectedToBios = false;
        reportBiosStatus();
    });
    socketClient.on('error', () => {
        console.log('error connecting');
        connectedToBios = false;
        reportBiosStatus();
    });

    connectToSocket();
}

let connectedToBios = false;

function connectToSocket() {
    /* Instance socket on create window */
    socketClient.connect({ host: '127.0.0.1', port: 7778 });
}

function reportBiosStatus() {
    mainWindow?.webContents?.send('bios-connection-status', connectedToBios);
}

function rawStringToBuffer(str: string) {
    var idx,
        len = str.length,
        arr = new Array(len);
    for (idx = 0; idx < len; ++idx) {
        arr[idx] = str.charCodeAt(idx) & 0xff;
    }
    // You may create an ArrayBuffer from a standard array (of values) as follows:
    return new Uint8Array(arr);
}

async function registerListeners() {
    /**
     * This comes from bridge integration, check bridge.ts
     */
    ipcMain.on('message', (_, message) => {
        console.log(message);
    });

    ipcMain.on('send-event', (_, message) => {
        console.log('writing data to bios:', message);
        socketClient?.write(rawStringToBuffer(message));
    });

    ipcMain.on('retry-connection', () => {
        console.log('attempting to reconnect...');
        connectToSocket();
    });

    ipcMain.on('poll-bios-connection', reportBiosStatus);
}

app.on('ready', createWindow)
    .whenReady()
    // .then(() => {
    //     installExtension(REACT_DEVELOPER_TOOLS)
    //         .then(name => console.log(`Added Extension:  ${name}`))
    //         .catch(err => console.log('An error occurred: ', err));
    // })
    .then(registerListeners)
    .catch(e => console.error(e));

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('before-quit', function () {
    socketClient?.end();
});

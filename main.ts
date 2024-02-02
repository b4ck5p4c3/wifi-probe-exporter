import express from "express";
import fs from "fs";
import dotenv from "dotenv";
import {String, Array, Record, Static} from "runtypes";
import {connectToWifi} from "./wifi";
import {startDhcp} from "./dhcp";
import {pingHost} from "./ping";

dotenv.config({
    path: ".env.local"
})
dotenv.config();

const port = parseInt(process.env.PORT ?? "9004");
const configFilePath = process.env.CONFIG_FILE ?? "/data/config.json";
const interval = parseInt(process.env.INTERVAL ?? "15000");
const wifiConnectTimeout = parseInt(process.env.WIFI_CONNECT_TIMEOUT ?? "10000");
const dhcpRetrievalTimeout = parseInt(process.env.DHCP_RETRIEVAL_TIMEOUT ?? "3000");
const pingTimeout = parseInt(process.env.PING_TIMEOUT ?? "1000");

const app = express();

const rawConfig = JSON.parse(fs.readFileSync(configFilePath).toString());

function isBssid(string: string): boolean {
    return /^([a-fA-F0-9]{2}):([a-fA-F0-9]{2}):([a-fA-F0-9]{2}):([a-fA-F0-9]{2}):([a-fA-F0-9]{2}):([a-fA-F0-9]{2})$/.test(string);
}

const StationConfigType = Record({
    name: String,
    ssid: String.optional(),
    bssid: String.withConstraint(isBssid),
    psk: String.optional(),
    pingHost: String
});

type StationConfig = Static<typeof StationConfigType>;

const ConfigType = Record({
    stations: Array(StationConfigType),
    interface: String
});

const config = ConfigType.check(rawConfig);

interface StationMetrics {
    connectionSucceeded: boolean;
    connectionTime: number;
    dhcpSucceeded: boolean;
    dhcpRetrievalTime: number;
    pingSucceeded: boolean;
    pingRttTime: number;
}

const metrics: {
    [name: string]: StationMetrics
} = {};

let lastProbingTime = process.hrtime.bigint();

for (const station of config.stations) {
    metrics[station.name] = {
        connectionSucceeded: false,
        connectionTime: 0,
        dhcpSucceeded: false,
        dhcpRetrievalTime: 0,
        pingSucceeded: false,
        pingRttTime: 0
    };
}

function convertTimeToSeconds(time: bigint): number {
    return Number(time / 1000n) / 1000000;
}

async function runTest(station: StationConfig): Promise<void> {
    try {
        const connectionStartTime = process.hrtime.bigint();
        const wifiHandle = await connectToWifi(config.interface, station, wifiConnectTimeout);
        const connectionTime = convertTimeToSeconds(process.hrtime.bigint() - connectionStartTime);

        try {
            const dhcpStartTime = process.hrtime.bigint();
            const dhcpHandle = await startDhcp(config.interface, dhcpRetrievalTimeout);
            const dhcpRetrievalTime = convertTimeToSeconds(process.hrtime.bigint() - dhcpStartTime);

            try {
                const pingRttTime = convertTimeToSeconds(
                    await pingHost(config.interface, station.pingHost, pingTimeout));

                console.info(`Successful connection, DHCP and ping test on station ${station.name}`);
                metrics[station.name] = {
                    connectionSucceeded: true,
                    connectionTime: connectionTime,
                    dhcpSucceeded: true,
                    dhcpRetrievalTime: dhcpRetrievalTime,
                    pingSucceeded: true,
                    pingRttTime: pingRttTime
                }
            } catch (e) {
                console.error(`Failed to ping host: ${e}`);
                metrics[station.name] = {
                    connectionSucceeded: true,
                    connectionTime: connectionTime,
                    dhcpSucceeded: true,
                    dhcpRetrievalTime: dhcpRetrievalTime,
                    pingSucceeded: false,
                    pingRttTime: 0
                }
            } finally {
                await dhcpHandle.stop();
            }
        } catch (e) {
            console.error(`Failed to start DHCP: ${e}`);
            metrics[station.name] = {
                connectionSucceeded: true,
                connectionTime: connectionTime,
                dhcpSucceeded: false,
                dhcpRetrievalTime: 0,
                pingSucceeded: false,
                pingRttTime: 0
            }
        } finally {
            await wifiHandle.disconnect();
        }
    } catch (e) {
        console.error(`Failed to connect to WiFi: ${e}`);
        metrics[station.name] = {
            connectionSucceeded: false,
            connectionTime: 0,
            dhcpSucceeded: false,
            dhcpRetrievalTime: 0,
            pingSucceeded: false,
            pingRttTime: 0
        }
    }
}

let testRunning = false;

async function runTests(): Promise<void> {
    if (testRunning) {
        return;
    }
    testRunning = true;
    for (const station of config.stations) {
        await runTest(station);
    }
    testRunning = false;
    lastProbingTime = process.hrtime.bigint();
}

app.get('/metrics', (_, res) => {
    let result = '';
    for (const station in metrics) {
        const stationMetrics = metrics[station];
        result += `# HELP ${station}-connection-succeeded Is connection to ${station} succeeded (1 - ok, 0 - failed)\n`;
        result += `# TYPE ${station}-connection-succeeded gauge\n`;
        result += `${station}-connection-succeeded ${stationMetrics.connectionSucceeded ? 1 : 0}\n`;
        result += `# HELP ${station}-connection-time Time it takes to connect to ${station}\n`;
        result += `# TYPE ${station}-connection-time gauge\n`;
        result += `${station}-connection-time ${stationMetrics.connectionTime.toFixed(6)}\n`;
        result += `# HELP ${station}-dhcp-succeeded Is DHCP on ${station} succeeded (1 - ok, 0 - failed)\n`;
        result += `# TYPE ${station}-dhcp-succeeded gauge\n`;
        result += `${station}-dhcp-succeeded ${stationMetrics.dhcpSucceeded ? 1 : 0}\n`;
        result += `# HELP ${station}-dhcp-retrieval-time Time it takes to get DHCP on ${station}\n`;
        result += `# TYPE ${station}-dhcp-retrieval-time gauge\n`;
        result += `${station}--dhcp-retrieval-time ${stationMetrics.dhcpRetrievalTime.toFixed(6)}\n`;
        result += `# HELP ${station}-ping-succeeded Is ping on ${station} succeeded (1 - ok, 0 - failed)\n`;
        result += `# TYPE ${station}-ping-succeeded gauge\n`;
        result += `${station}-ping-succeeded ${stationMetrics.pingSucceeded ? 1 : 0}\n`;
        result += `# HELP ${station}-ping-rtt-time Ping RTT on ${station}\n`;
        result += `# TYPE ${station}-ping-rtt-time gauge\n`;
        result += `${station}-ping-rtt-time ${stationMetrics.pingRttTime.toFixed(6)}\n`;
    }

    result += '# HELP last-probing-time Time since last full probe\n';
    result += '# TYPE last-probing-time gauge\n';
    result += `last-probing-time ${convertTimeToSeconds(process.hrtime.bigint() - lastProbingTime).toFixed(6)}\n`

    res.end(result);
});

app.listen(port, () => {
    console.info(`Started on port ${port}`);
});

runTests().catch(console.error);
setInterval(() => runTests().catch(console.error), interval);
import fs, {promises as fsPromises, stat} from "fs";
import internal from "stream";
import * as child_process from "child_process";

interface WifiHandle {
    disconnect: () => Promise<void>;
}

interface StationConfig {
    ssid?: string;
    bssid: string;
    psk?: string;
}

export async function connectToWifi(dev: string, station: StationConfig, timeout: number): Promise<WifiHandle> {
    let configContents = 'network={\n';
    if (station.ssid !== undefined) {
        configContents += `  ssid=${JSON.stringify(station.ssid)}\n`;
    }
    configContents += `  bssid=${station.bssid}\n`;
    if (station.psk !== undefined) {
        configContents += `  psk=${JSON.stringify(station.psk)}\n`;
    }
    configContents += "}\n";

    const configFilePath = `/tmp/wpa_supplicant_config_${Math.random().toFixed(10).slice(2)}.conf`;
    await fsPromises.writeFile(configFilePath, configContents);

    const process = child_process.spawn("/usr/sbin/wpa_supplicant",
        [`-i${dev}`, `-c${configFilePath}`], {
            stdio: "pipe"
        });

    let resolvePromise: (handle: WifiHandle) => void;
    let rejectPromise: (e: Error) => void;

    const resultPromise = new Promise<WifiHandle>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });

    let resolveDisconnectPromise: () => void;

    const disconnectPromise = new Promise<void>(resolve => {
        resolveDisconnectPromise = resolve;
    });

    let timeoutTimeout = setTimeout(() => {
        processTimeout = true;
        process.kill("SIGINT");
    }, timeout);

    let processTimeout = false;
    let processExitedSuccessfully = false;

    process.on("exit", errorCode => {
        fsPromises.rm(configFilePath).catch(console.error);
        if (processExitedSuccessfully) {
            resolveDisconnectPromise();
            return;
        }
        rejectPromise(new Error(`wpa_supplicant exited with ${errorCode}, timeout: ${processTimeout}`));
    });

    const disconnect: () => Promise<void> = function () {
        if (process.exitCode !== null) {
            return Promise.resolve();
        }
        processExitedSuccessfully = true;
        process.kill("SIGINT");
        return disconnectPromise;
    };

    process.stdout.on("data", data => {
        console.info(JSON.stringify(data) + " " + typeof data);
        if (typeof data !== "string") {
            return;
        }
        const strings = data.split("\n").map(item => item.trim()).map(item => item);
        for (const string of strings) {
            console.info(`wpa_supplicant log: ${string}`);
            if (!processTimeout) {
                if (string.startsWith(`${dev}: CTRL-EVENT-CONNECTED - Connection to ${station.bssid.toLowerCase()} completed`)) {
                    clearTimeout(timeoutTimeout);
                    resolvePromise({
                        disconnect
                    });
                }
            }
        }
    });

    return resultPromise;
}
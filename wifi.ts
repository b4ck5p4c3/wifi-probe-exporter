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
        configContents += `  ssid=${station.ssid}\n`;
    }
    configContents += `  bssid=${station.bssid}\n`;
    if (station.psk !== undefined) {
        configContents += `  psk=${JSON.stringify(station.psk)}\n`;
    }
    const configFilePath = `/tmp/wpa_supplicant_config_${Math.random().toFixed(10).slice(2)}.conf`;
    await fsPromises.writeFile(configFilePath, configContents);

    const command = `/usr/sbin/wpa_supplicant -i${dev} -c${configFilePath}`;

    const process = child_process.spawn(command, {
        stdio: "pipe"
    });

    let resolvePromise: (handle: WifiHandle) => void;
    let rejectPromise: (e: Error) => void;

    const resultPromise = new Promise<WifiHandle>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });

    const disconnect: () => Promise<void> = function () {
        if (process.exitCode !== null) {
            return fsPromises.rm(configFilePath);
        }
        let resolvePromise: () => void;
        const promise = new Promise<void>(resolve => {
            resolvePromise = resolve;
        });
        process.on("exit", () => {
            resolvePromise();
        });
        process.kill("SIGINT");
        return promise.then(() => fsPromises.rm(configFilePath));
    };

    process.on("exit", errorCode => {
        if (errorCode != 0) {
            rejectPromise(new Error(`wpa_supplicant exited with ${errorCode}`));
        }
    });

    process.stdout.on("data", data => {
        console.info(data.toString());
    });

    return resultPromise;
}
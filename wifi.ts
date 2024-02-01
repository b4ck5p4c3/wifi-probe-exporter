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
        return promise;
    };

    process.on("exit", errorCode => {
        if (errorCode != 0) {
            rejectPromise(new Error(`wpa_supplicant exited with ${errorCode}`));
            fsPromises.rm(configFilePath).catch(console.error);
        }
    });

    process.stdout.on("data", data => {
        console.info(JSON.stringify(data.toString()));
    });

    return resultPromise;
}
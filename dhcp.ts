import child_process from "child_process";

interface DhcpHandle {
    stop(): Promise<void>;
}

export function startDhcp(dev: string, timeout: number): Promise<DhcpHandle> {
    const process = child_process.spawn("/usr/sbin/dhclient",
        ["-v", "-1", "-d", dev], {
            stdio: "pipe"
        });

    let resolvePromise: (handle: DhcpHandle) => void;
    let rejectPromise: (e: Error) => void;

    const resultPromise = new Promise<DhcpHandle>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });

    let timeoutTimeout = setTimeout(() => {
        processTimeout = true;
        process.kill("SIGINT");
    }, timeout);

    let resolveStopPromise: () => void;

    const stopPromise = new Promise<void>(resolve => {
        resolveStopPromise = resolve;
    });

    let processTimeout = false;
    let processExitedSuccessfully = false;

    process.on("exit", errorCode => {
        if (processExitedSuccessfully) {
            resolveStopPromise();
            return;
        }
        rejectPromise(new Error(`dhclient exited with ${errorCode}, timeout: ${processTimeout}`));
    });

    const stop: () => Promise<void> = function () {
        if (process.exitCode !== null) {
            return Promise.resolve();
        }
        processExitedSuccessfully = true;
        process.kill("SIGINT");
        return stopPromise;
    };

    function dataHandler(data: unknown): void {
        if (!(data instanceof Buffer)) {
            return;
        }
        const strings = data.toString("utf8").split("\n")
            .map(item => item.trim()).filter(item => item);
        for (const string of strings) {
            console.info(`dhclient log on ${dev}: ${string}`);
            if (!processTimeout) {
                if (string.startsWith("bound to")) {
                    clearTimeout(timeoutTimeout);
                    resolvePromise({
                        stop
                    });
                }
            }
        }
    }

    process.stdout.on("data", dataHandler);
    process.stderr.on("data", dataHandler);

    return resultPromise;
}
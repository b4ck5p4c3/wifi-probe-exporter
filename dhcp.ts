import child_process from "child_process";

export function startDhcp(dev: string, timeout: number): Promise<void> {
    const process = child_process.spawn("/usr/sbin/dhclient",
        ["-v", dev], {
            stdio: "pipe"
        });

    let resolvePromise: () => void;
    let rejectPromise: (e: Error) => void;

    const resultPromise = new Promise<void>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });

    let timeoutTimeout = setTimeout(() => {
        processTimeout = true;
        process.kill("SIGINT");
    }, timeout);

    let processTimeout = false;

    process.on("exit", errorCode => {
        if (errorCode === 0) {
            return;
        }
        rejectPromise(new Error(`dhclient exited with ${errorCode}, timeout: ${processTimeout}`));
    });

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
                    resolvePromise();
                }
            }
        }
    }

    process.stdout.on("data", dataHandler);
    process.stderr.on("data", dataHandler);

    return resultPromise;
}
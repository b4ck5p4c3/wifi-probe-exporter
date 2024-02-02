import {PingResponse, promise as pingPromise} from "ping";

export async function pingHost(dev: string, host: string, timeout: number): Promise<bigint> {
    let times: number[] = [];
    let lastErrorResponse: PingResponse | undefined = undefined;
    for (let i = 0; i < 4; i++) {
        const result = await pingPromise.probe(host, {
            numeric: true,
            timeout: timeout / 1000,
            extra: [`-I`, dev]
        })
        if (result.time === "unknown") {
            lastErrorResponse = result;
        } else {
            times.push(result.time);
        }
    }
    if (times.length === 0) {
        if (lastErrorResponse) {
            throw new Error(`Ping error: ${lastErrorResponse.output}`);
        } else {
            throw new Error('Unknown ping error');
        }
    }
    return BigInt(Math.floor(times.reduce((p, v) => p + v, 0) * 1000 * 1000 / 4));
}
import {promise as pingPromise} from "ping";

export async function pingHost(dev: string, host: string, timeout: number): Promise<bigint> {
    const result = await pingPromise.probe(host, {
        numeric: true,
        timeout: timeout / 1000,
        extra: [`-I`, dev]
    })
    if (result.time === "unknown") {
        throw new Error(`Ping error: ${result.output}`);
    }
    return BigInt(Math.floor(result.time * 1000 * 1000));
}
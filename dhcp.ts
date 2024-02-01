interface DhcpHandle {
    stop: () => void;
}

export async function startDhcp(dev: string, timeout: number): Promise<DhcpHandle> {
    return {
        stop() {

        }
    };
}
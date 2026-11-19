// Small fetch-style test server on Node's http module (stands in for upstream APIs in tests).
// Mirrors the parts of Bun.serve the tests used ({ port: 0, fetch }), `url` (with trailing slash) and `stop()`.
// The Request's signal aborts when the client disconnects, so tests can observe cancelled upstream calls.
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';

export type TestServer = { url: URL; port: number; stop: (closeActiveConnections?: boolean) => Promise<void> };
type ServeOptions = { port?: number; fetch: (request: Request) => Response | Promise<Response> };

const toHeaders = (incoming: IncomingHttpHeaders) => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming)) {
        if (value === undefined) continue;
        for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v);
    }
    return headers;
};

export async function serve({ port: listenPort = 0, fetch: handler }: ServeOptions): Promise<TestServer> {
    const server = createServer(async (req, res) => {
        const aborted = new AbortController();
        res.on('close', () => {
            if (!res.writableFinished) aborted.abort();
        });
        const { port } = server.address() as AddressInfo;
        const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
        const request = new Request(`http://127.0.0.1:${port}${req.url}`, {
            method: req.method,
            headers: toHeaders(req.headers),
            body: hasBody ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : undefined,
            signal: aborted.signal,
            duplex: 'half'
        } as RequestInit);
        try {
            const response = await handler(request);
            res.writeHead(response.status, [...response.headers].flat());
            if (!response.body) return void res.end();
            const reader = response.body.getReader();
            res.on('close', () => void reader.cancel().catch(() => {}));
            for (;;) {
                const { done, value } = await reader.read();
                if (done || res.destroyed) break;
                res.write(value);
            }
            res.end();
        } catch (error) {
            if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(String(error));
        }
    });
    await new Promise<void>((resolve) => server.listen(listenPort, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return {
        url: new URL(`http://127.0.0.1:${port}/`),
        port,
        stop: () =>
            new Promise<void>((resolve) => {
                server.closeAllConnections();
                server.close(() => resolve());
            })
    };
}

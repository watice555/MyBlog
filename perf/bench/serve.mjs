import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { gzipSync } from "node:zlib";

// Serve the exported site with the same compression on both sides of a pair.
export async function serve(directory) {
  const root = resolve(directory);
  const cache = new Map();
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      let file = resolve(root, `.${pathname}`);
      if (!file.startsWith(root + sep)) throw new Error("Invalid path");
      if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
      if (!cache.has(file)) {
        const raw = await readFile(file);
        const compressed = /\.(html|js|css|json|svg|txt|xml)$/.test(file);
        cache.set(file, { body: compressed ? gzipSync(raw) : raw, compressed });
      }
      const { body, compressed } = cache.get(file);
      res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Content-Length": body.length, "Cache-Control": "no-store", ...(compressed ? { "Content-Encoding": "gzip" } : {}) });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done) => server.close(done)) };
}

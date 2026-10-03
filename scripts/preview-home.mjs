import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

// Separate from both Next's app routes and the production Vite configuration.
const root = fileURLToPath(new URL("../previews/home/", import.meta.url));
const server = await createServer({
  configFile: false,
  envFile: false,
  root,
  publicDir: false,
  plugins: [react()],
  define: { "process.env.NEXT_PUBLIC_SITE_URL": JSON.stringify("https://watice555.github.io/MyBlog/") },
  server: {
    host: "127.0.0.1",
    port: 4175,
    strictPort: true,
    fs: {
      allow: [root, ...["app", "lib", "node_modules"].map((path) => fileURLToPath(new URL(`../${path}/`, import.meta.url)))],
    },
  },
});

await server.listen();
server.printUrls();

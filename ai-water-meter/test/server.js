// Tiny static file server for the fixture HTML pages.
const http = require("http");
const fs = require("fs");
const path = require("path");

const FIXTURES_DIR = path.join(__dirname, "fixtures");
const PORT = 8933;

function start() {
  const server = http.createServer((req, res) => {
    const file = path.join(FIXTURES_DIR, decodeURIComponent(req.url.split("?")[0]).replace(/^\//, ""));
    if (!file.startsWith(FIXTURES_DIR)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

module.exports = { start, PORT };

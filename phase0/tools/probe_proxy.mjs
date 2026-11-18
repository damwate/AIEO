import net from "node:net";
const PORTS = [1991, 24601, 20017, 23759, 14013, 7819];
function testConnect(port) {
  return new Promise((resolve) => {
    const sock = net.connect(port, "127.0.0.1");
    let done = false;
    const finish = (r) => { if (done) return; done = true; sock.destroy(); resolve(r); };
    sock.setTimeout(8000);
    sock.on("connect", () => sock.write(`CONNECT chatgpt.com:443 HTTP/1.1\r\nHost: chatgpt.com:443\r\n\r\n`));
    sock.on("data", (d) => {
      const s = d.toString("latin1").split("\r\n")[0];
      finish(`${port} => ${s}`);
    });
    sock.on("timeout", () => finish(`${port} => TIMEOUT`));
    sock.on("error", (e) => finish(`${port} => ERR ${e.code}`));
  });
}
for (const p of PORTS) console.log(await testConnect(p));

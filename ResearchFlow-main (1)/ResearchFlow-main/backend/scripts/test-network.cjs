// Database tests are local only. Do not send telemetry or other outbound data.
process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = "";
process.env.APPINSIGHTS_INSTRUMENTATIONKEY = "";
process.env.APPLICATION_INSIGHTS_NO_DIAGNOSTIC_CHANNEL = "true";
process.env.OTEL_SDK_DISABLED = "true";
process.env.DO_NOT_TRACK = "1";
const net = require("node:net");
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const options = normalized[0];
  const host =
    typeof options === "object"
      ? options.host
      : typeof normalized[1] === "string"
        ? normalized[1]
        : "localhost";
  if (host && !["localhost", "127.0.0.1", "::1"].includes(host))
    throw new Error("Database tests permit loopback connections only");
  return connect.apply(this, args);
};

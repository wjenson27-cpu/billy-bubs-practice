/* Simulator worker. Same rules engine as the live table. */
importScripts("engine.js", "table-engine.js", "strategies.js");

self.onmessage = function (event) {
  var msg = event.data || {};
  if (msg.type !== "run") return;
  try {
    var results = self.CrapsStrategies.runSim(msg.config);
    self.postMessage({ type: "result", id: msg.id, results: results });
  } catch (err) {
    self.postMessage({ type: "error", id: msg.id, message: err && err.message ? err.message : "Simulation failed." });
  }
};

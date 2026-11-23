/** OctoPrint / Moonraker bridge. Server-side only. */

function normalizeBase(baseUrl) {
  const url = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) throw new Error("Printer URL must start with http:// or https://");
  return url;
}

async function jsonRequest(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Printer responded ${res.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function fetchPrinterStatus({ kind, baseUrl, apiKey }) {
  const base = normalizeBase(baseUrl);
  if (kind === "octoprint") {
    const headers = apiKey ? { "X-Api-Key": apiKey } : {};
    const [printer, job] = await Promise.all([
      jsonRequest(`${base}/api/printer`, { headers }),
      jsonRequest(`${base}/api/job`, { headers }),
    ]);
    const temp = printer.temperature || {};
    return {
      online: true,
      state: printer.state?.text || "Unknown",
      nozzle: temp.tool0?.actual ?? null,
      nozzleTarget: temp.tool0?.target ?? null,
      bed: temp.bed?.actual ?? null,
      bedTarget: temp.bed?.target ?? null,
      progress: job.progress?.completion ?? null,
      fileName: job.job?.file?.name || null,
      timeLeft: job.progress?.printTimeLeft ?? null,
      timeElapsed: job.progress?.printTime ?? null,
    };
  }
  const headers = apiKey ? { "X-Api-Key": apiKey } : {};
  const data = await jsonRequest(
    `${base}/printer/objects/query?print_stats&heater_bed&extruder&display_status&virtual_sdcard`,
    { headers }
  );
  const status = data.result?.status || {};
  const stats = status.print_stats || {};
  return {
    online: true,
    state: stats.state || "unknown",
    nozzle: status.extruder?.temperature ?? null,
    nozzleTarget: status.extruder?.target ?? null,
    bed: status.heater_bed?.temperature ?? null,
    bedTarget: status.heater_bed?.target ?? null,
    progress: status.display_status?.progress ?? null,
    fileName: stats.filename || null,
    timeElapsed: stats.print_duration ?? null,
    timeLeft: null,
  };
}

export async function uploadGcodeFile({ kind, baseUrl, apiKey, filename, gcode }) {
  const base = normalizeBase(baseUrl);
  const form = new FormData();
  form.append("file", new Blob([gcode], { type: "text/plain" }), filename);
  const headers = apiKey ? { "X-Api-Key": apiKey } : {};
  if (kind === "octoprint") {
    form.append("select", "false");
    form.append("print", "false");
    const res = await fetch(`${base}/api/files/local`, { method: "POST", headers, body: form });
    if (!res.ok) throw new Error(`Upload rejected by OctoPrint (${res.status}).`);
    return { ok: true, path: filename };
  }
  form.append("root", "gcodes");
  const res = await fetch(`${base}/server/files/upload`, { method: "POST", headers, body: form });
  if (!res.ok) throw new Error(`Upload rejected by Moonraker (${res.status}).`);
  return { ok: true, path: filename };
}

export async function sendPrinterCommand({ kind, baseUrl, apiKey, action }) {
  const base = normalizeBase(baseUrl);
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["X-Api-Key"] = apiKey;
  const octo = {
    pause: { path: "/api/job", body: { command: "pause", action: "pause" } },
    resume: { path: "/api/job", body: { command: "pause", action: "resume" } },
    cancel: { path: "/api/job", body: { command: "cancel" } },
  };
  const moon = {
    pause: { path: "/printer/print/pause", body: {} },
    resume: { path: "/printer/print/resume", body: {} },
    cancel: { path: "/printer/print/cancel", body: {} },
  };
  const spec = kind === "octoprint" ? octo[action] : moon[action];
  if (!spec) throw new Error("Unsupported printer command");
  await jsonRequest(`${base}${spec.path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(spec.body),
  });
  return { ok: true, action };
}
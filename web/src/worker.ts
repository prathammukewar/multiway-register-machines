/** The engine worker: loads Pyodide, installs the mrm wheel, and answers
 * run/branchial requests. All mathematics happens in Python (mrm.web builds
 * every payload); this file only moves JSON strings around. */

import type { WorkerRequest, WorkerResponse } from "./types.js";

const PYODIDE_INDEX = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

const ctx = self as unknown as {
  postMessage(message: WorkerResponse): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

const GLUE = `
import json

from mrm import web

LAST = None

def mrm_run(doc_text, params_text):
    global LAST
    payload, ev = web.run(doc_text, params_text)
    if ev is not None:
        LAST = ev
    return json.dumps(payload)

def mrm_branchial(step):
    return json.dumps(web.branchial(LAST, step))

def mrm_wl():
    return json.dumps(web.wolfram_text(LAST))
`;

interface PyProxy {
  (...args: unknown[]): unknown;
}

interface Pyodide {
  loadPackage(url: string): Promise<void>;
  runPython(code: string): unknown;
  globals: { get(name: string): PyProxy };
}

let runFn: PyProxy | null = null;
let branchialFn: PyProxy | null = null;
let wlFn: PyProxy | null = null;

async function init(wheelUrl: string): Promise<void> {
  ctx.postMessage({ type: "status", stage: "loading-pyodide" });
  const module = (await import(PYODIDE_INDEX + "pyodide.mjs")) as {
    loadPyodide(options: { indexURL: string }): Promise<Pyodide>;
  };
  const pyodide = await module.loadPyodide({ indexURL: PYODIDE_INDEX });
  ctx.postMessage({ type: "status", stage: "loading-engine" });
  await pyodide.loadPackage(wheelUrl);
  pyodide.runPython(GLUE);
  runFn = pyodide.globals.get("mrm_run");
  branchialFn = pyodide.globals.get("mrm_branchial");
  wlFn = pyodide.globals.get("mrm_wl");
  ctx.postMessage({ type: "status", stage: "ready" });
}

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  void (async () => {
    try {
      if (message.type === "init") {
        await init(message.wheelUrl);
      } else if (message.type === "run") {
        if (!runFn) throw new Error("engine is not ready yet");
        const payload = runFn(message.doc, message.params) as string;
        ctx.postMessage({ type: "result", id: message.id, payload });
      } else if (message.type === "branchial") {
        if (!branchialFn) throw new Error("engine is not ready yet");
        const payload = branchialFn(message.step) as string;
        ctx.postMessage({ type: "result", id: message.id, payload });
      } else if (message.type === "wl") {
        if (!wlFn) throw new Error("engine is not ready yet");
        const payload = wlFn() as string;
        ctx.postMessage({ type: "result", id: message.id, payload });
      }
    } catch (error) {
      ctx.postMessage({
        type: "error",
        id: "id" in message ? message.id : null,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })();
};

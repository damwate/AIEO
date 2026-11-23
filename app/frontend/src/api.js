// Minimal API client for the M1 platform (C7 session cookie + CSRF header).
const BASE = "/api/v1";

let csrfToken = null;

export function setCsrfToken(token) {
  csrfToken = token;
}

async function request(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (csrfToken && method !== "GET") {
    headers["X-CSRF-Token"] = csrfToken;
  }
  const response = await fetch(BASE + path, {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${data.code || response.status}: ${data.message || "request failed"}`);
  }
  return data;
}

export const api = {
  login: (username, password) => request("POST", "/auth/login", { username, password }),
  logout: () => request("POST", "/auth/logout", {}),
  session: () => request("GET", "/auth/session"),
  projects: () => request("GET", "/projects"),
  tasks: (query = "") => request("GET", `/tasks${query}`),
  task: (taskId) => request("GET", `/tasks/${taskId}`),
  standardWork: () => request("GET", "/standard/work"),
  approveStandardPlan: (plan) => request("POST", "/standard/plans", plan),
  previewStandardUrgent: (id) => request("GET", `/standard/tasks/${id}/urgent`),
  promoteStandardTask: (id, victim) => request("POST", `/standard/tasks/${id}/urgent`, { expected_victim: victim }),
  board: (projectId = "") => request("GET", `/board${projectId}`),
};

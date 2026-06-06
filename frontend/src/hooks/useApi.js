const BASE = "/api";

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

export const api = {
  assets: {
    list:    ()          => apiFetch("/assets"),
    get:     (id)        => apiFetch(`/assets/${id}`),
    history: (id)        => apiFetch(`/assets/${id}/history`),
    create:  (data)      => apiFetch("/assets",      { method: "POST",   body: data }),
    update:  (id, data)  => apiFetch(`/assets/${id}`, { method: "PUT",   body: data }),
    delete:  (id)        => apiFetch(`/assets/${id}`, { method: "DELETE" }),
  },
  dataSources: {
    list:   ()      => apiFetch("/data-sources"),
    get:    (id)    => apiFetch(`/data-sources/${id}`),
    create: (data)  => apiFetch("/data-sources", { method: "POST", body: data }),
  },
  timeSeries: {
    get: (params) => {
      const q = new URLSearchParams(params).toString();
      return apiFetch(`/time-series?${q}`);
    },
    latest: (logicalAssetId) => apiFetch(`/time-series/latest?logicalAssetId=${logicalAssetId}`),
  },
  analytics: {
    analyze: (params) => {
      const q = new URLSearchParams(params).toString();
      return apiFetch(`/analytics/analyze?${q}`);
    },
    compare: (body) => apiFetch("/analytics/compare", { method: "POST", body }),
  },
  ingest: {
    alphavantage: (body) => apiFetch("/ingest/alphavantage", { method: "POST", body }),
    manual:       (body) => apiFetch("/ingest/manual",       { method: "POST", body }),
  },
  llm: {
    chat: (messages) => apiFetch("/llm/chat", { method: "POST", body: { messages } }),
  },
};

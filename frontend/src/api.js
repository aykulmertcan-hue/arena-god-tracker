const j = async (res) => {
  if (res.status === 204) return null;
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  return res.json();
};

export const getServers = () => fetch("/api/servers").then(j);
export const getCurrent = () => fetch("/api/accounts/current").then(j);
export const createAccount = (body) =>
  fetch("/api/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j);
export const getChecklist = (id) => fetch(`/api/accounts/${id}/checklist`).then(j);
export const getStatus = (id) => fetch(`/api/accounts/${id}/status`).then(j);

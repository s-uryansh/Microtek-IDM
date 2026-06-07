import { post, get } from "../client.js";

export function fetchExceptions({ status, contextType, page = 1, pageSize = 50, signal } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (contextType) params.set("contextType", contextType);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return get(`/idm-10/exceptions?${params.toString()}`, { signal });
}

export function fetchException({ exceptionId, signal }) {
  return get(`/idm-10/exceptions/${exceptionId}`, { signal });
}

export function correctException({ exceptionId, correctionReason, signal }) {
  return post(`/idm-10/exceptions/${exceptionId}/correct`, { correctionReason }, { signal });
}

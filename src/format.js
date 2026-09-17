export const time = (n) =>
  `${Math.floor((n || 0) / 60)}:${String(Math.floor((n || 0) % 60)).padStart(2, "0")}`;
export const date = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
export const fileUrl = (id, name) => `/api/lessons/${id}/files/${name}`;
export const isWorking = (status) =>
  ["queued", "generating", "rendering"].includes(status);

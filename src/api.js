let token = "";
export const setToken = (value) => {
  token = value;
};
export async function api(url, options = {}) {
  const response = await fetch("/api" + url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Lesson-Token": token,
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
export const post = (url, data, method = "POST") =>
  api(url, { method, body: JSON.stringify(data) });

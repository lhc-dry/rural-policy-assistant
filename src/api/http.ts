import axios from "axios";
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  timeout: 30000,
  withCredentials: true,
});
api.interceptors.request.use((config) => {
  return config;
});
api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (axios.isAxiosError(e) && e.response?.status === 401) {
      window.dispatchEvent(new Event("auth-change"));
    }
    const message = axios.isAxiosError(e)
      ? e.response?.data?.message ||
        (e.code === "ECONNABORTED"
          ? "请求超时，请重试"
          : "网络异常，请检查连接")
      : String(e);
    return Promise.reject(new Error(message));
  },
);

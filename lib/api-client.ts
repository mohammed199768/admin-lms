import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
  AxiosRequestConfig,
} from 'axios';
import type { ApiResponse } from '@/types/api';
import { logger } from '@/lib/utils/logger';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';
if (!API_BASE_URL) {
  throw new Error('FATAL: NEXT_PUBLIC_API_BASE_URL is not defined. Check .env');
}

class ApiClient {
  private axiosInstance: AxiosInstance;
  private accessToken: string | null = null;
  private isRefreshing = false;
  private isRefreshFailed = false;
  private refreshSubscribers: Array<{
    resolve: (token: string) => void;
    reject: (error: Error) => void;
  }> = [];
  private onPersistentAuthFailure: (() => void) | null = null;
  private activeControllers: Map<string, AbortController> = new Map();

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      withCredentials: true,
    });

    this.setupInterceptors();

    // DEV: log only when a NEW instance is created
    if (process.env.NODE_ENV === 'development') {
      const g = globalThis as any;
      g.__adminApiClientNewCount = (g.__adminApiClientNewCount || 0) + 1;
      console.log(`[ApiClient] NEW instance created. Count: ${g.__adminApiClientNewCount}`);
    }
  }

  private setupInterceptors() {
    this.axiosInstance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        if (config.data instanceof FormData) {
          // let axios set multipart boundary
        } else if (config.headers && !config.headers['Content-Type']) {
          config.headers['Content-Type'] = 'application/json';
        }

        if (this.accessToken && config.headers) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest =
          error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        if (axios.isCancel(error)) return Promise.reject(error);

        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          !originalRequest.url?.includes('auth/refresh')
        ) {
          if (this.isRefreshFailed) return Promise.reject(error);

          if (this.isRefreshing) {
            return new Promise((resolve, reject) => {
              this.refreshSubscribers.push({
                resolve: (token: string) => {
                  if (originalRequest.headers) {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                  }
                  resolve(this.axiosInstance(originalRequest));
                },
                reject,
              });
            });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const response = await this.axiosInstance.post<ApiResponse<{ accessToken: string }>>(
              '/auth/refresh',
              {},
              { withCredentials: true }
            );

            if (response.data.success && response.data.data?.accessToken) {
              const newToken = response.data.data.accessToken;
              this.setAccessToken(newToken);

              this.refreshSubscribers.forEach(({ resolve }) => resolve(newToken));
              this.refreshSubscribers = [];

              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
              }
              return this.axiosInstance(originalRequest);
            }

            throw new Error('Refresh response invalid');
          } catch (refreshError) {
            this.isRefreshFailed = true;
            this.clearAccessToken();

            const err =
              refreshError instanceof Error ? refreshError : new Error('Token refresh failed');
            this.refreshSubscribers.forEach(({ reject }) => reject(err));
            this.refreshSubscribers = [];

            if (this.onPersistentAuthFailure) this.onPersistentAuthFailure();

            if (typeof window !== 'undefined') {
              const seg = window.location.pathname.split('/');
              const locale = ['en', 'ar'].includes(seg[1]) ? seg[1] : 'en';
              window.location.href = `/${locale}/login`;
            }

            return Promise.reject(refreshError);
          } finally {
            this.isRefreshing = false;
          }
        }

        return Promise.reject(error);
      }
    );
  }

  public setAccessToken(token: string) {
    this.accessToken = token;
  }

  public clearAccessToken() {
    this.accessToken = null;
  }

  public getToken(): string | null {
    return this.accessToken;
  }

  public setOnPersistentAuthFailure(callback: () => void) {
    this.onPersistentAuthFailure = callback;
  }

  public createAbortController(key: string): AbortController {
    this.abortRequest(key);
    const controller = new AbortController();
    this.activeControllers.set(key, controller);
    return controller;
  }

  public abortRequest(key: string): void {
    const controller = this.activeControllers.get(key);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(key);
    }
  }

  private cleanupController(key?: string): void {
    if (key) this.activeControllers.delete(key);
  }

  async get<T>(
    url: string,
    config: AxiosRequestConfig & { abortKey?: string } = {}
  ): Promise<T> {
    const { abortKey, ...axiosConfig } = config;
    if (abortKey) {
      const controller = this.createAbortController(abortKey);
      axiosConfig.signal = controller.signal;
    }

    try {
      const response = await this.axiosInstance.get(url, axiosConfig);

      if (axiosConfig.responseType === 'blob' || axiosConfig.responseType === 'arraybuffer') {
        return response.data as T;
      }

      const apiRes = response.data as ApiResponse<T>;
      if (!apiRes.success) throw new Error(apiRes.message || 'API request failed');
      return apiRes.data as T;
    } finally {
      this.cleanupController(abortKey);
    }
  }

  async post<T>(
    url: string,
    data?: unknown,
    config: AxiosRequestConfig & { abortKey?: string } = {}
  ): Promise<T> {
    const { abortKey, ...axiosConfig } = config;
    if (abortKey) {
      const controller = this.createAbortController(abortKey);
      axiosConfig.signal = controller.signal;
    }

    try {
      const response = await this.axiosInstance.post<ApiResponse<T>>(url, data, axiosConfig);
      if (!response.data.success) throw new Error(response.data.message || 'API request failed');
      return response.data.data as T;
    } finally {
      this.cleanupController(abortKey);
    }
  }

  async put<T>(url: string, data?: unknown, config: AxiosRequestConfig & { abortKey?: string } = {}) {
    const { abortKey, ...axiosConfig } = config;
    if (abortKey) {
      const controller = this.createAbortController(abortKey);
      axiosConfig.signal = controller.signal;
    }

    try {
      const response = await this.axiosInstance.put<ApiResponse<T>>(url, data, axiosConfig);
      if (!response.data.success) throw new Error(response.data.message || 'API request failed');
      return response.data.data as T;
    } finally {
      this.cleanupController(abortKey);
    }
  }

  async patch<T>(url: string, data?: unknown, config: AxiosRequestConfig & { abortKey?: string } = {}) {
    const { abortKey, ...axiosConfig } = config;
    if (abortKey) {
      const controller = this.createAbortController(abortKey);
      axiosConfig.signal = controller.signal;
    }

    try {
      const response = await this.axiosInstance.patch<ApiResponse<T>>(url, data, axiosConfig);
      if (!response.data.success) throw new Error(response.data.message || 'API request failed');
      return response.data.data as T;
    } finally {
      this.cleanupController(abortKey);
    }
  }

  async delete<T>(url: string, config: AxiosRequestConfig & { abortKey?: string } = {}) {
    const { abortKey, ...axiosConfig } = config;
    if (abortKey) {
      const controller = this.createAbortController(abortKey);
      axiosConfig.signal = controller.signal;
    }

    try {
      const response = await this.axiosInstance.delete<ApiResponse<T>>(url, axiosConfig);
      if (!response.data.success) throw new Error(response.data.message || 'API request failed');
      return response.data.data as T;
    } finally {
      this.cleanupController(abortKey);
    }
  }

  async getBlob(url: string, config: AxiosRequestConfig & { abortKey?: string } = {}): Promise<Blob> {
    return this.get<Blob>(url, { ...config, responseType: 'blob' });
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __adminApiClient: ApiClient | undefined;
}

const client = globalThis.__adminApiClient ?? new ApiClient();

// Cache only in dev to survive fast refresh
if (process.env.NODE_ENV === 'development') {
  globalThis.__adminApiClient = client;
}

export const apiClient = client;
export default client;

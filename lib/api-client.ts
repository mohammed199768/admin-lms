import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@/types/api';
import { logger } from '@/lib/utils/logger';

const isDev = process.env.NODE_ENV === 'development';
// Task 1: Fix baseURL reliability (critical)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

if (!API_BASE_URL) {
  // STRICT ENFORCEMENT: Client must crash if ENV is missing to prevent debugging ghosts
  throw new Error('FATAL: NEXT_PUBLIC_API_BASE_URL is not defined. Check .env');
}

// Task 2: Enforce strict singleton (counter)
if (isDev) {
    const globalAny = globalThis as any;
    globalAny.__apiClientCount = (globalAny.__apiClientCount || 0) + 1;
    console.log(`[ApiClient] Instance initialized. Count: ${globalAny.__apiClientCount}`);
    
    if (globalAny.__apiClientCount > 1) {
        console.warn('⚠️ WARNING: Multiple ApiClient instances detected! Ensure singleton usage.');
    }
}

/**
 * SECURITY: In-Memory Token Storage
 * Tokens are NEVER persisted to localStorage or sessionStorage.
 * This class manages authentication state entirely in memory.
 */
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
      // REMOVED: Global Content-Type header (breaks FormData)
      // Content-Type is now set conditionally in the request interceptor
      withCredentials: true,
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    this.axiosInstance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        // CRITICAL FIX: Set Content-Type conditionally
        // Only set application/json if the payload is NOT FormData
        // This allows Axios to auto-set multipart/form-data for file uploads
        if (config.data instanceof FormData) {
          // Let Axios handle Content-Type automatically for FormData
          // It will set: multipart/form-data; boundary=...
          // DO NOT set Content-Type here
        } else if (config.headers && !config.headers['Content-Type']) {
          // Default to JSON for non-FormData requests
          config.headers['Content-Type'] = 'application/json';
        }

        if (this.accessToken && config.headers) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }
        
        // DEV INSTRUMENTATION: Log Request Details
        if (process.env.NODE_ENV === 'development') {
           const url = config.url || '';
           const isLogin = url.includes('/auth/login');
           
           if (isLogin) {
             const body = config.data as any;
             console.log(`[API] Login Attempt to ${config.baseURL}${url}`, {
               email: body?.email,
               passLen: body?.password?.length,
               keys: Object.keys(body || {}),
               headers: config.headers
             });
           } else if (!url.includes('/auth/refresh')) {
             console.debug(`[API] Req: ${url} | Auth: ${!!config.headers?.Authorization ? 'YES' : 'NO'}`);
           }
        }
        
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        // Skip refresh logic for aborted requests
        if (axios.isCancel(error)) {
          return Promise.reject(error);
        }

        if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('auth/refresh')) {
          logger.warn('401 received - checking refresh state', { url: originalRequest.url, isRefreshFailed: this.isRefreshFailed });
          
          if (this.isRefreshFailed) {
            logger.warn('Rejecting request - refresh already failed');
            return Promise.reject(error);
          }
          
          if (this.isRefreshing) {
            logger.info('Queueing request - refresh in progress');
            return new Promise<typeof axios.prototype>((resolve, reject) => {
              this.refreshSubscribers.push({
                resolve: (token: string) => {
                  if (originalRequest.headers) {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                  }
                  resolve(this.axiosInstance(originalRequest));
                },
                reject: (err: Error) => {
                  reject(err);
                }
              });
            });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;
          logger.info('Attempting token refresh');

          try {
            const response = await this.axiosInstance.post<ApiResponse<{ accessToken: string }>>(
              '/auth/refresh',
              {},
              { withCredentials: true }
            );

            if (response.data.success && response.data.data?.accessToken) {
              logger.info('Token refresh successful');
              const newToken = response.data.data.accessToken;
              this.setAccessToken(newToken);

              // Resolve all queued requests with new token
              this.refreshSubscribers.forEach(({ resolve }) => resolve(newToken));
              this.refreshSubscribers = [];

              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
              }

              return this.axiosInstance(originalRequest);
            } else {
              throw new Error('Refresh response invalid');
            }
          } catch (refreshError) {
            logger.error('Token refresh failed', { isRefreshFailed: true });
            this.isRefreshFailed = true;
            this.clearAccessToken();
            
            // Reject all queued requests with the refresh error
            const error = refreshError instanceof Error ? refreshError : new Error('Token refresh failed');
            this.refreshSubscribers.forEach(({ reject }) => reject(error));
            this.refreshSubscribers = [];

            if (this.onPersistentAuthFailure) {
              this.onPersistentAuthFailure();
            }

            if (typeof window !== 'undefined') {
              const pathSegments = window.location.pathname.split('/');
              const currentLocale = ['en', 'ar'].includes(pathSegments[1]) ? pathSegments[1] : 'en';
              logger.error('Persistent auth failure - redirecting to login', { locale: currentLocale });
              window.location.href = `/${currentLocale}/login`;
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

  /**
   * SECURITY: Set token in memory only - never persisted
   */
  public setAccessToken(token: string) {
    this.accessToken = token;
    
    // DEV ONLY: Confirm token set without exposing value
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] Token set, length: ${token?.length || 0}`);
    }
  }

  /**
   * SECURITY: Clear token from memory
   */
  public clearAccessToken() {
    this.accessToken = null;
  }

  /**
   * SECURITY: Get token for secure blob fetching (Authorization header)
   * Returns null if not authenticated
   */
  public getToken(): string | null {
    return this.accessToken;
  }

  public setOnPersistentAuthFailure(callback: () => void) {
    this.onPersistentAuthFailure = callback;
  }

  public resetRefreshState() {
    this.isRefreshing = false;
    this.isRefreshFailed = false;
  }

  public markRefreshFailed() {
    this.isRefreshFailed = true;
    this.isRefreshing = false;
    this.clearAccessToken();
  }

  /**
   * Create an AbortController for a request, tracked by a unique key
   */
  public createAbortController(key: string): AbortController {
    // Cancel any existing controller with the same key
    this.abortRequest(key);
    
    const controller = new AbortController();
    this.activeControllers.set(key, controller);
    return controller;
  }

  /**
   * Abort a request by its key
   */
  public abortRequest(key: string): void {
    const controller = this.activeControllers.get(key);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(key);
    }
  }

  /**
   * Clean up an AbortController after request completes
   */
  private cleanupController(key?: string): void {
    if (key) {
      this.activeControllers.delete(key);
    }
  }

  async get<T>(url: string, config: AxiosRequestConfig & { abortKey?: string } = {}): Promise<T> {
    const { abortKey, ...axiosConfig } = config;
    
    if (abortKey) {
      const controller = this.createAbortController(abortKey);
      axiosConfig.signal = controller.signal;
    }

    try {
      const response = await this.axiosInstance.get(url, axiosConfig);

      // If requesting Blob or ArrayBuffer, return data directly as T
      if (axiosConfig.responseType === 'blob' || axiosConfig.responseType === 'arraybuffer') {
        return response.data as T;
      }

      // Default: Expect JSON wrapper
      const apiRes = response.data as ApiResponse<T>;
      if (!apiRes.success) {
        throw new Error(apiRes.message || 'API request failed');
      }
      return apiRes.data as T;
    } finally {
      this.cleanupController(abortKey);
    }
  }

  async post<T>(url: string, data?: unknown, config: AxiosRequestConfig & { abortKey?: string } = {}): Promise<T> {
    const { abortKey, ...axiosConfig } = config;
    
    if (abortKey) {
      const controller = this.createAbortController(abortKey);
      axiosConfig.signal = controller.signal;
    }

    try {
      const response = await this.axiosInstance.post<ApiResponse<T>>(url, data, axiosConfig);
      if (!response.data.success) {
        throw new Error(response.data.message || 'API request failed');
      }
      return response.data.data as T;
    } finally {
      this.cleanupController(abortKey);
    }
  }

  async put<T>(url: string, data?: unknown, config: AxiosRequestConfig & { abortKey?: string } = {}): Promise<T> {
    const { abortKey, ...axiosConfig } = config;
    
    if (abortKey) {
      const controller = this.createAbortController(abortKey);
      axiosConfig.signal = controller.signal;
    }

    try {
      const response = await this.axiosInstance.put<ApiResponse<T>>(url, data, axiosConfig);
      if (!response.data.success) {
        throw new Error(response.data.message || 'API request failed');
      }
      return response.data.data as T;
    } finally {
      this.cleanupController(abortKey);
    }
  }

  async patch<T>(url: string, data?: unknown, config: AxiosRequestConfig & { abortKey?: string } = {}): Promise<T> {
    const { abortKey, ...axiosConfig } = config;
    
    if (abortKey) {
      const controller = this.createAbortController(abortKey);
      axiosConfig.signal = controller.signal;
    }

    try {
      const response = await this.axiosInstance.patch<ApiResponse<T>>(url, data, axiosConfig);
      if (!response.data.success) {
        throw new Error(response.data.message || 'API request failed');
      }
      return response.data.data as T;
    } finally {
      this.cleanupController(abortKey);
    }
  }

  async delete<T>(url: string, config: AxiosRequestConfig & { abortKey?: string } = {}): Promise<T> {
    const { abortKey, ...axiosConfig } = config;
    
    if (abortKey) {
      const controller = this.createAbortController(abortKey);
      axiosConfig.signal = controller.signal;
    }

    try {
      const response = await this.axiosInstance.delete<ApiResponse<T>>(url, axiosConfig);
      if (!response.data.success) {
        throw new Error(response.data.message || 'API request failed');
      }
      return response.data.data as T;
    } finally {
      this.cleanupController(abortKey);
    }
  }

  /**
   * Fetch a resource as a Blob (for secure document viewing)
   * Uses Authorization header - NO token in URL
   */
  async getBlob(url: string, config: AxiosRequestConfig & { abortKey?: string } = {}): Promise<Blob> {
    return this.get<Blob>(url, { ...config, responseType: 'blob' });
  }
}
declare global {
  // eslint-disable-next-line no-var
  var __adminApiClient: ApiClient | undefined;
}

const client = globalThis.__adminApiClient ?? new ApiClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__adminApiClient = client;
}

export const apiClient = client;
export default client;
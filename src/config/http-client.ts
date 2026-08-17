import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { logger } from '@/utils/logger';

export interface HttpClientOptions {
  timeout?: number;
  headers?: Record<string, string>;
  validateStatus?: (status: number) => boolean;
}

export interface HttpResponse<T> {
  status: number;
  data: T;
  headers: Record<string, unknown>;
}

class HttpClient {
  private client: AxiosInstance;

  constructor(options?: HttpClientOptions) {
    this.client = axios.create({
      timeout: options?.timeout || 10000,
      headers: options?.headers,
      validateStatus: options?.validateStatus || (status => status >= 200 && status < 300),
    });

    this.client.interceptors.response.use(
      response => response,
      error => {
        logger.error({ error, url: error.config?.url }, 'HTTP request failed');
        throw error;
      }
    );
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    const response = await this.client.get<T>(url, config);
    return this.mapResponse(response);
  }

  async post<T>(url: string, data?: Record<string, unknown>, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    const response = await this.client.post<T>(url, data, config);
    return this.mapResponse(response);
  }

  async put<T>(url: string, data?: Record<string, unknown>, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    const response = await this.client.put<T>(url, data, config);
    return this.mapResponse(response);
  }

  async patch<T>(url: string, data?: Record<string, unknown>, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    const response = await this.client.patch<T>(url, data, config);
    return this.mapResponse(response);
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    const response = await this.client.delete<T>(url, config);
    return this.mapResponse(response);
  }

  private mapResponse<T>(response: AxiosResponse<T>): HttpResponse<T> {
    return {
      status: response.status,
      data: response.data,
      headers: response.headers,
    };
  }
}

export const httpClient = new HttpClient();
export const createHttpClient = (options?: HttpClientOptions) => new HttpClient(options);

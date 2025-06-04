import axios, { AxiosInstance } from 'axios';
import {
    API_URL,
    API_HEADERS,
    LoginRequest,
    RegisterRequest,
    AuthResponse,
    ApiResponse,
    Project,
    ProjectFile,
    StoredUserInfo
} from '../config/api';
import {id} from "postcss-selector-parser";


const isClient = typeof window !== 'undefined';
const API_PREFIX = '/api';
// const API_PREFIX = '';


class ApiService {
    private authToken: string | null | undefined = null;
    private axiosInstance: AxiosInstance;

    constructor() {
        this.axiosInstance = axios.create({
            baseURL: API_URL,
            headers: API_HEADERS
        });
        console.log("API_URL:", API_URL);

        // Добавляем интерсептор для добавления токена авторизации
        this.axiosInstance.interceptors.request.use((config) => {
            if (this.authToken) {
                config.headers.Authorization = `Bearer ${this.authToken}`;
            }
            return config;
        });
    }

    async login(data: LoginRequest): Promise<ApiResponse<AuthResponse>> {
        try {
            const response = await this.axiosInstance.post<ApiResponse<AuthResponse>>(`${API_PREFIX}/Auth/login`, data);

            if (response.data.success && response.data.data) {
                this.authToken = response.data.data.token;

                if (isClient) {
                    // localStorage.setItem('authToken', response.data.data.token);
                    localStorage.setItem('userId', String(response.data.data.userId));
                    // Сохраняем все дополнительные поля
                    if (response.data.data.companyName) {
                        localStorage.setItem('companyName', response.data.data.companyName);
                    }
                    if (response.data.data.userSurname) {
                        localStorage.setItem('userSurname', response.data.data.userSurname);
                    }
                    if (response.data.data.userName) {
                        localStorage.setItem('userName', response.data.data.userName);
                    }
                    if (response.data.data.login) {
                        localStorage.setItem('login', response.data.data.login);
                    }
                    if (response.data.data.email) {
                        localStorage.setItem('email', response.data.data.email);
                    }
                    if (response.data.data.companyPosition) {
                        localStorage.setItem('companyPosition', response.data.data.companyPosition);
                    }
                }
            }
            return response.data;
        } catch (error: unknown) {
            console.error("Ошибка при запросе:", error);
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 401) {
                    return {
                        success: false,
                        error: "Неавторизованный доступ. Пожалуйста, проверьте свои учетные данные."
                    };
                }
            }
            return {
                success: false,
                error: axios.isAxiosError(error) ? error.response?.data?.message || error.message : 'Неизвестная ошибка'
            };
        }
    }

    async register(
        userData: RegisterRequest,
        companyData?: { companyName: string; companyPosition: string }
    ): Promise<ApiResponse<AuthResponse>> {
        try {
            // Регистрация пользователя
            console.log("Данные для регистрации пользователя:", userData);
            const userResponse = await this.axiosInstance.post<ApiResponse<AuthResponse>>(`${API_PREFIX}/auth/register`, userData);
            console.log("Ответ от сервера (пользователь):", userResponse.data);

            if (!userResponse.data.success || !userResponse.data.data?.token) {
                return { success: false, error: userResponse.data.error || "Ошибка регистрации пользователя" };
            }

            this.authToken = userResponse.data.data.token;
            if (isClient) {
                localStorage.setItem('authToken', this.authToken);
            }

            // Если данные компании предоставлены, регистрируем компанию
            if (companyData) {
                console.log("Данные для регистрации компании:", companyData);
                const companyResponse = await this.axiosInstance.post<ApiResponse<AuthResponse>>(`${API_PREFIX}/company/register`, companyData);
                console.log("Ответ от сервера (компания):", companyResponse.data);

                if (!companyResponse.data.success || !companyResponse.data.data?.userId) {
                    return { success: false, error: companyResponse.data.error || "Ошибка регистрации компании" };
                }

                return { success: true, data: { ...companyResponse.data.data, token: this.authToken } };
            }

            return { success: true, data: { ...userResponse.data.data, token: this.authToken } };
        } catch (error) {
            console.log("Ошибка при регистрации:", error);
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 409) {
                    return {
                        success: false,
                        error: "Пользователь с таким email уже существует"
                    };
                } else if (error.response?.status === 401) {
                    return {
                        success: false,
                        error: "Неавторизованный доступ. Пожалуйста, войдите в систему."
                    };
                }
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Ошибка регистрации'
            };
        }
    }

    async getUserInfo(userId: number): Promise<ApiResponse<StoredUserInfo>> {
        try {
            console.log(`[ApiService] Запрос информации о пользователе с userId=${userId}`);
            const response = await this.axiosInstance.get<StoredUserInfo>(`${API_PREFIX}/Auth/getinfo?id=${userId}`);

            console.log("[ApiService] Полученный ответ:", response);
            const userInfo = response.data;

            if (!userInfo) {
                console.warn("[ApiService] В ответе отсутствуют данные пользователя");
                return {
                    success: false,
                    error: "Данные пользователя отсутствуют в ответе сервера",
                };
            }

            if (isClient) {
                localStorage.setItem("userName", userInfo.userName || "");
                localStorage.setItem("userSurname", userInfo.userSurname || "");
                localStorage.setItem("companyName", userInfo.companyName || "");
                localStorage.setItem("companyPosition", userInfo.companyPosition || "");
                localStorage.setItem("login", userInfo.login || "");
                localStorage.setItem("email", userInfo.email || "");
                localStorage.setItem("password", userInfo.password || "");
                localStorage.setItem("confirmPassword", userInfo.confirmPassword || "");
            }

            return {
                success: true,
                data: userInfo,
            };
        } catch (error) {
            console.error("[ApiService] Ошибка при получении информации о пользователе:", error);
            return {
                success: false,
                error: axios.isAxiosError(error) ? error.response?.data?.message || error.message : 'Неизвестная ошибка',
            };
        }
    }

    // Инициализация аутентификации на клиентской стороне
    initializeAuth() {
        if (isClient) {
            const token = localStorage.getItem('authToken');
            if (token) {
                this.authToken = token;
            }
        }
    }

    // Метод для выхода
    logout() {
        this.authToken = null;
        if (isClient) {
            localStorage.removeItem('authToken');
            localStorage.removeItem('token')
        }
    }

    async getUserProjects(userId: string): Promise<ApiResponse<Project[]>> {
        try {
            const response = await this.axiosInstance.get<ApiResponse<Project[]>>(`${API_PREFIX}/Project?userId=${userId}`);
            console.log("Полученные проекты:", response.data);
            return response.data;
        } catch (error) {
            console.error("Ошибка при получении проектов:", error);
            return {
                success: false,
                error: axios.isAxiosError(error) ? error.response?.data?.message || error.message : 'Неизвестная ошибка',
            };
        }
    }

    async postUserProject(project: Omit<Project, "id">): Promise<Project | undefined> {
        try {
            const response = await this.axiosInstance.post<Project>(`${API_PREFIX}/Project`, project);
            console.log("Созданный проект:", response.data);
            return response.data;
        } catch (error) {
            console.error("Ошибка при создании проекта:", error);
            return undefined;
        }
    }

    async putUserProject(projectId: number, project: Project): Promise<void> {
        try {
            await this.axiosInstance.put(`${API_PREFIX}/Project/${projectId}`, project);
            console.log("Проект обновлен");
        } catch (error) {
            console.error("Ошибка при обновлении проекта:", error);
            throw error; // или просто возвращай, если хочешь обработать ошибку отдельно
        }
    }

    async deleteUserProject(projectId: number): Promise<ApiResponse<Project>> {
        try {
            const response = await this.axiosInstance.delete<ApiResponse<Project>>(`${API_PREFIX}/Project/${projectId}`);
            console.log("Удаленный проект:", response.data);
            return response.data;
        } catch (error) {
            console.error("Ошибка при удалении проекта:", error);
            return {
                success: false,
                error: axios.isAxiosError(error) ? error.response?.data?.message || error.message : 'Неизвестная ошибка',
            };
        }
    }

    async getUserProjectFiles(userId: number, projectId: number): Promise<ApiResponse<ProjectFile[]>> {
        try {
            const response = await this.axiosInstance.get(`${API_PREFIX}/Project/${projectId}/files?userId=${userId}`);
            const data = response.data;

            console.log("Полученные файлы проекта:", data);

            // Если API вернул просто массив файлов, оборачиваем вручную
            if (Array.isArray(data)) {
                return {
                    success: true,
                    data,
                };
            }

            // Если API вернул стандартный ApiResponse
            if (data.success !== undefined) {
                return data;
            }

            // Иначе формат неожиданный
            return {
                success: false,
                error: "Неверный формат ответа от сервера",
            };
        } catch (error: unknown) {
            console.error("Ошибка при получении файлов проекта:", error);

            if (axios.isAxiosError(error)) {
                console.error("Server error details:", error.response);
                return {
                    success: false,
                    error: error.message || "Неизвестная ошибка",
                };
            }

            return {
                success: false,
                error: "Неизвестная ошибка",
            };
        }
    }

    async PostProjectFile(
        projectId: number,
        file: File,
        userId: number
    ): Promise<ApiResponse<ProjectFile | undefined>> {
        try {
            const formData = new FormData();
            formData.append('files', file);
            formData.append('userId', String(userId));

            const response = await this.axiosInstance.post<ApiResponse<ProjectFile | undefined>>(
                `${API_PREFIX}/Project/${projectId}/files`,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                }
            );

            console.log("Полученный файл:", response.data);
            return response.data;
        } catch (error) {
            console.error("Ошибка при загрузке файла:", error);
            return {
                success: false,
                error: axios.isAxiosError(error) ? error.response?.data?.message || error.message : 'Неизвестная ошибка',
            };
        }
    }

    async DownloadFilesZip(projectId: number): Promise<ApiResponse<Blob | undefined>> {
        try {
            const response = await this.axiosInstance.get<Blob>(`${API_PREFIX}/Project/${projectId}/files/download`, {
                responseType: 'blob',
            });
            console.log("Полученные файлы (blob):", response.data);
            return {
                success: true,
                data: response.data,
            };
        } catch (error) {
            console.error("Ошибка при загрузке файла:", error);
            return {
                success: false,
                error: axios.isAxiosError(error) ? error.response?.data?.message || error.message : 'Неизвестная ошибка',
            };
        }
    }

    // async DownloadFile(fileId: number): Promise<ApiResponse<Blob | undefined>> {
    //     try {
    //         const response = await this.axiosInstance.get<Blob>(`/Project/files/${fileId}/download`, {
    //             responseType: 'blob',
    //         });
    //         console.log("Полученный файл (blob):", response.data);
    //         return {
    //             success: true,
    //             data: response.data,
    //         };
    //     } catch (error) {
    //         console.error("Ошибка при загрузке файла:", error);
    //         return {
    //             success: false,
    //             error: axios.isAxiosError(error) ? error.response?.data?.message || error.message : 'Неизвестная ошибка',
    //         };
    //     }
    // }

    async DeleteProjectFile(fileId: number): Promise<ApiResponse<ProjectFile | undefined>> {
        try {
            const response = await this.axiosInstance.delete<ApiResponse<ProjectFile>>(`${API_PREFIX}/Project/files/${fileId}`);
            console.log("Удаленный файл:", response.data);
            return response.data;
        } catch (error) {
            console.error("Ошибка при удалении файла проекта:", error);
            return {
                success: false,
                error: axios.isAxiosError(error) ? error.response?.data?.message || error.message : 'Неизвестная ошибка',
            };
        }
    }

    async RenameProjectFile(fileId: number, newFileName: string): Promise<void> {
        try {
            await this.axiosInstance.put(
                `${API_PREFIX}/Project/files/${fileId}/rename`,
                { NewFileName: newFileName },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            console.log("Имя файла обновлено");
        } catch (error) {
            console.error("Ошибка при обновлении имени файла:", error);
            throw error;
        }
    }
}

export const apiService = new ApiService();

// Инициализация аутентификации только на клиентской стороне
if (isClient) {
    apiService.initializeAuth();
}

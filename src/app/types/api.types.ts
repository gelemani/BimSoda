export interface User {
    id: number;
    login: string;
    email: string;
    userName: string;
    userSurname: string;
    role: string;
}

export interface Project {
    id: number;
    name: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    ownerId: number;
}

export interface ProjectFile {
    id: number;
    fileName: string;
    fileSize?: number;
    contentType?: string;
    projectId: number;
    lastModified: string;
    uploadedBy: number;
}

export interface ProjectUser {
    id: number;
    name: string;
    email: string;
    role: string;
}

export interface Comment {
    id: number;
    text: string;
    elementId: string;
    elementName: string;
    createdAt: string;
    userId: number;
    userName: string;
}

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

export interface LoginRequest {
    login: string;
    password: string;
}

export interface LoginResponse {
    token: string;
    user: User;
}

export interface RegisterRequest {
    login: string;
    password: string;
    email: string;
    userName: string;
    userSurname: string;
}

export interface FileUploadResponse {
    fileId: number;
    fileName: string;
    fileSize: number;
    contentType: string;
}

export interface ProjectCreate {
    title: string;
    description?: string;
    accessLevel: 'public' | 'private';
    userId: number;
} 
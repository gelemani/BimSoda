'use client';

import React, { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ClipLoader from "react-spinners/ClipLoader";
import { apiService } from "@/app/services/api.service";
import { Project, ProjectFile } from "@/app/config/api";
import useFileViewer from '@/app/components/hooks/useFileViewer';
import Header from "@/app/components/header";
import JSZip from "jszip";

function defineContent(fileName: string) {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'pdf':
            return '📄';
        case 'doc':
        case 'docx':
            return '📝';
        case 'xls':
        case 'xlsx':
            return '📊';
        case 'jpg':
        case 'jpeg':
        case 'png':
            return '🖼️';
        case 'zip':
        case 'rar':
            return '📦';
        default:
            return '📁';
    }
}

function truncateFileName(fileName: string, maxLength = 30) {
    if (fileName.length <= maxLength) return fileName;
    const extension = fileName.split('.').pop();
    const name = fileName.slice(0, maxLength - 3);
    return `${name}...${extension}`;
}

const Page = (): React.JSX.Element => {
    const router = useRouter();
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(true);
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [companyName, setCompanyName] = useState<string>("");
    const [userName, setUserName] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const searchInputText: string = 'Поиск файла...';
    const { openFileInViewer } = useFileViewer();

    const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
    const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
    const fileCacheRef = useRef<Map<number, File>>(new Map());

    const userId = typeof window !== "undefined" ? Number(localStorage.getItem("userId")) : 0;

    const [currentProjectId, setCurrentProjectId] = useState<number>(0);
    const [currentProjectTitle, setCurrentProjectTitle] = useState<string>("");

    useEffect(() => {
        if (typeof window !== "undefined") {
            const id = Number(localStorage.getItem("projectId")) || 0;
            const title = localStorage.getItem("projectTitle") || "";
            const userName = localStorage.getItem("userName") || "";
            const companyName = localStorage.getItem("companyName") || "";
            setUserName(userName);
            setCompanyName(companyName);
            setCurrentProjectId(id);
            setCurrentProjectTitle(title);
        }
    }, []);

    useEffect(() => {
        if (!userId) return;

        const fetchProjects = async () => {
            const projectsResult = await apiService.getUserProjects(String(userId));
            if (projectsResult.success && projectsResult.data) {
                setProjects(projectsResult.data);
            }
        };

        void fetchProjects();
    }, [userId]);

    useEffect(() => {
        let isMounted = true;

        if (!userId || !currentProjectId) {
            return;
        }

        const fetchFiles = async () => {
            setIsLoadingFiles(true);
            try {
                const result = await apiService.getUserProjectFiles(userId, currentProjectId);
                if (isMounted) {
                    if (result.success && Array.isArray(result.data)) {
                        console.log('Received files data:', result.data);
                        // Получаем размеры файлов из zip
                        const zipResult = await apiService.DownloadFilesZip(currentProjectId);
                        if (zipResult.success && zipResult.data) {
                            const zip = await JSZip.loadAsync(zipResult.data);
                            const filesWithSize = result.data.map(file => {
                                const zipEntry = zip.file(file.fileName);
                                return {
                                    ...file,
                                    fileSize: zipEntry ? (zipEntry as any)._data.uncompressedSize : 0
                                };
                            });
                            setProjectFiles(filesWithSize);
                        } else {
                            setProjectFiles(result.data);
                        }
                    } else {
                        console.error("Ошибка при загрузке файлов проекта:", result.error);
                        setError("Не удалось загрузить файлы проекта");
                    }
                }
            } catch (error) {
                console.error("Ошибка при загрузке файлов:", error);
                setError("Произошла ошибка при загрузке файлов");
            } finally {
                if (isMounted) {
                    setIsLoadingFiles(false);
                }
            }
        };

        void fetchFiles();

        return () => {
            isMounted = false;
        };
    }, [userId, currentProjectId]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const menu = document.getElementById('contextMenu');
            if (menu && !menu.contains(event.target as Node)) {
                setContextMenuPos(null);
                setSelectedFileId(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const filteredFiles = projectFiles.filter(file =>
        file.fileName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentProjectId || !userId) return;

        try {
            const result = await apiService.PostProjectFile(currentProjectId, file, userId);
            if (result.success) {
                setProjectFiles(prev => result.data ? [...prev, result.data] : prev);
                setUploadedFile(file);
                setSelectedFileId(null);
                setContextMenuPos(null);
            } else {
                console.error("Ошибка при загрузке файла:", result.error);
            }
        } catch (error) {
            console.error("Произошла ошибка при загрузке файла:", error);
        }
    };

    const handleOpenZipFile = async (projectId: number, file: ProjectFile) => {
        try {
            const result = await apiService.DownloadFilesZip(projectId);
            if (!result.success || !result.data) {
                console.error("Ошибка при загрузке zip-файла");
                return;
            }

            const zip = await JSZip.loadAsync(result.data);
            const fileName = file?.fileName;
            const zipEntry = zip.file(fileName);
            if (!zipEntry) {
                console.warn("Файл не найден в архиве:", fileName);
                return;
            }

            if (!zipEntry.dir) {
                const content = await zipEntry.async("blob");
                const openedFile = new File([content], fileName, { type: "application/octet-stream" });
                const objectUrl = URL.createObjectURL(openedFile);
                try {
                    await openFileInViewer({ 
                        file: openedFile, 
                        url: objectUrl,
                        fileId: file.id 
                    });
                } catch (error) {
                    console.error("Ошибка при открытии файла:", error);
                    // Если произошла ошибка, пробуем открыть файл напрямую
                    window.open(objectUrl);
                }
            }
        } catch (err) {
            console.error("Ошибка при работе с zip-файлом:", err);
        }
    };

    const handleDeleteFile = async (fileId: number) => {
        if (!confirm("Вы уверены, что хотите удалить файл?")) return;

        const result = await apiService.DeleteProjectFile(fileId);
        if (result.success) {
            setProjectFiles(prev => prev.filter(f => f.id !== fileId));
            setSelectedFileId(null);
            setContextMenuPos(null);
        } else {
            console.error("Не удалось удалить файл:", result.error);
        }
    };

    const handleRenameFile = async (fileId: number, newName: string) => {
        try {
            await apiService.RenameProjectFile(fileId, newName);
            setProjectFiles(prev =>
                prev.map(f => f.id === fileId ? { ...f, fileName: newName } : f)
            );
        } catch (error) {
            console.error("Не удалось переименовать файл:", error);
        }
    };

    return (
        <div className="p-8 bg-[#1F252E] text-text-color min-h-screen">
            <Header centralString={currentProjectTitle}/>

            <div className="flex flex-col gap-8" style={{ marginTop: "44px" }}>
                <div className="flex justify-center items-center gap-4">
                    <input
                        type="text"
                        placeholder={searchInputText}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="px-4 py-2 pr-10 w-full rounded-lg border border-gray-700 bg-[#242B35] text-gray-300"
                    />
                    <label style={{ margin: 0 }}>
                        <input
                            id="file-upload"
                            type="file"
                            accept="*"
                            onChange={handleFileUpload}
                            style={{ display: "none" }}
                        />
                        <button
                            type="button"
                            style={{
                                cursor: "pointer",
                                fontSize: "1rem",
                                color: "#fff",
                                backgroundColor: "#3B82F6",
                                border: "none",
                                borderRadius: "6px",
                                padding: "8px 18px",
                                fontWeight: 500,
                                marginLeft: 0,
                                marginRight: 0,
                                display: "inline-block",
                                whiteSpace: "nowrap"
                            }}
                            onClick={() => document.getElementById("file-upload")?.click()}
                        >
                            Добавить файл
                        </button>
                    </label>
                </div>

                {isLoadingFiles ? (
                    <div className="flex justify-center items-center h-48">
                        <ClipLoader size={50} color={"#3B82F6"} loading={true} />
                    </div>
                ) : error ? (
                    <p className="text-red-500 mb-6">{error}</p>
                ) : filteredFiles.length === 0 ? (
                    <p className="text-red-500 mb-6">Нет файлов.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full bg-[#1F252E] border border-gray-700">
                            <thead>
                                <tr className="bg-[#242B35]">
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Имя файла</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Дата изменения</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Тип</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Объём</th>
                                </tr>
                            </thead>
                            <tbody className="bg-[#1F252E] divide-y divide-gray-700">
                                {filteredFiles.map((file) => (
                                    <tr
                                        key={file.id}
                                        className={`hover:bg-[#242B35] cursor-pointer ${
                                            selectedFileId === file.id ? 'bg-[#2A3341]' : ''
                                        }`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedFileId(file.id);
                                            setContextMenuPos({x: e.clientX + 12, y: e.clientY});
                                        }}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                            {truncateFileName(file.fileName)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                            {new Date(file.lastModified).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                            {file.contentType || defineContent(file.fileName)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                            {(() => {
                                                const sizeInKB = file.fileSize ? file.fileSize / 1024 : 0;
                                                if (sizeInKB >= 1024) {
                                                    return (sizeInKB / 1024).toFixed(2) + ' Мб';
                                                } else {
                                                    return sizeInKB.toFixed(2) + ' Кб';
                                                }
                                            })()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {contextMenuPos && selectedFileId !== null && (() => {
                const file = projectFiles.find(f => f.id === selectedFileId);
                if (!file) return null;
                return (
                    <div
                        id="contextMenu"
                        style={{
                            position: "fixed",
                            top: contextMenuPos.y,
                            left: contextMenuPos.x,
                            backgroundColor: "#1F252E",
                            border: "1px solid #2A3341",
                            boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
                            borderRadius: 6,
                            padding: 8,
                            zIndex: 9999,
                            width: 200,
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            style={{
                                padding: "8px 12px",
                                cursor: "pointer",
                                borderBottom: "1px solid #2A3341",
                                color: "#E5E7EB",
                            }}
                            onClick={() => {
                                handleOpenZipFile(currentProjectId, file);
                                setContextMenuPos(null);
                                setSelectedFileId(null);
                            }}
                        >
                            Открыть
                        </div>
                        <div
                            style={{
                                padding: "8px 12px",
                                cursor: "pointer",
                                borderBottom: "1px solid #2A3341",
                                color: "#E5E7EB",
                            }}
                            onClick={() => {
                                const newName = prompt("Введите новое имя файла:", file.fileName);
                                if (newName && newName.trim() && newName !== file.fileName) {
                                    handleRenameFile(file.id, newName.trim());
                                }
                                setContextMenuPos(null);
                                setSelectedFileId(null);
                            }}
                        >
                            Переименовать
                        </div>
                        <div
                            style={{
                                padding: "8px 12px",
                                cursor: "pointer",
                                borderBottom: "1px solid #2A3341",
                                color: "#EF4444",
                            }}
                            onClick={() => {
                                handleDeleteFile(file.id);
                                setContextMenuPos(null);
                                setSelectedFileId(null);
                            }}
                        >
                            Удалить
                        </div>
                        <div
                            style={{
                                padding: "8px 12px",
                                cursor: "pointer",
                                color: "#E5E7EB",
                            }}
                            onClick={() => {
                                setSelectedFileId(null);
                                setContextMenuPos(null);
                            }}
                        >
                            Закрыть
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default Page;

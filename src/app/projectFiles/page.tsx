'use client';

import React, { useEffect, useState, useRef } from "react";
import JSZip from "jszip";
import { apiService } from "@/app/services/api.service";
import { Project, ProjectFile } from "@/app/config/api";
import useFileViewer from '@/app/components/hooks/useFileViewer';
import { useRouter } from "next/navigation";
import Header from "@/app/components/header";

function defineContent(fileName: string) {
    const parts = fileName.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
}

function truncateFileName(name: string, maxLength: number = 34): string {
    if (name.length <= maxLength) return name;
    return name.slice(0, maxLength - 3) + '...';
}

const Page = (): React.JSX.Element => {
    const router = useRouter();
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [companyName, setCompanyName] = useState<string>("");
    const [userName, setUserName] = useState<string>("");
    const [userMenuOpen, MenuOpen] = useState(false);
    const { openFileInViewer } = useFileViewer();
    const [error, setError] = useState<string | null>(null);
    const searchInputText: string = 'Поиск файла...';

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
            const projectsResult = await apiService.getUserProjects(userId);
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
            const result = await apiService.getUserProjectFiles(userId, currentProjectId);
            if (isMounted) {
                if (result.success && result.data) {
                    setProjectFiles(result.data);
                } else {
                    console.error("Ошибка при загрузке файлов проекта:", result.error);
                }
            }
        };

        void fetchFiles();

        return () => {
            isMounted = false;
        };
    }, [userId, currentProjectId]);

    useEffect(() => {
        const project = projects.find(p => p.id === currentProjectId);
        if (project) {
            setCurrentProjectTitle(project.title);
            if (typeof window !== "undefined") {
                localStorage.setItem("projectTitle", project.title);
            }
        }
    }, [projects, currentProjectId]);

    useEffect(() => {
        const handleMouseDown = (e: MouseEvent) => {
            const menu = document.getElementById('contextMenu');
            if (menu && !menu.contains(e.target as Node)) {
                setContextMenuPos(null);
                setSelectedFileId(null);
            }
        };

        window.addEventListener("mousedown", handleMouseDown);
        return () => window.removeEventListener("mousedown", handleMouseDown);
    }, []);

    useEffect(() => {
        const fetchZipAndSetFileSizes = async () => {
            if (!currentProjectId) return;

            try {
                const result = await apiService.DownloadFilesZip(currentProjectId);
                if (!result.success || !result.data) {
                    console.error("Ошибка при загрузке zip-файла");
                    return;
                }

                const zip = await JSZip.loadAsync(result.data);
                const sizesMap: Record<string, number> = {};
                await Promise.all(
                    Object.values(zip.files).map(async zipEntry => {
                        if (!zipEntry.dir) {
                            const content = await zipEntry.async("uint8array");
                            sizesMap[zipEntry.name] = content.length;
                        }
                    })
                );

                setProjectFiles(prev =>
                    prev.map(pf => ({
                        ...pf,
                        fileSize: sizesMap[pf.fileName] ?? pf.fileSize
                    }))
                );
            } catch (err) {
                console.error("Ошибка при обработке zip-файла:", err);
            }
        };

        fetchZipAndSetFileSizes();
    }, [currentProjectId]);


    const filteredFiles = projectFiles.filter(file =>
        file.fileName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const projectGroups = filteredFiles.reduce((acc, file) => {
        const pid = file.projectId || 1;
        if (!acc[pid]) acc[pid] = [];
        acc[pid].push(file);
        return acc;
    }, {} as Record<number, ProjectFile[]>);

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

    // Обработка открытия файла из контекстного меню
    // const handleOpenFile = async (file: ProjectFile) => {
    //     setContextMenuPos(null);
    //     setSelectedFileId(null);
    //
    //     // Сначала пытаемся взять файл из кеша
    //     let fileToOpen = fileCacheRef.current.get(file.id);
    //
    //     if (!fileToOpen) {
    //         const result = await apiService.DownloadFile(file.id);
    //         if (result.success && result.data) {
    //             const blobData = result.data;
    //             fileToOpen = new File([blobData], file.fileName.trim(), { type: file.contentType || "application/octet-stream" });
    //             fileCacheRef.current.set(file.id, fileToOpen);
    //         } else {
    //             console.error("Не удалось загрузить файл:", result.error);
    //             return;
    //         }
    //     }
    //
    //     if (fileToOpen) {
    //         const objectUrl = URL.createObjectURL(fileToOpen);
    //         openFileInViewer({ file: fileToOpen, url: objectUrl });
    //         // revokeObjectURL теперь вызывается безопасно после закрытия файла в DocsViewerPage
    //     }
    // };


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
                openFileInViewer({ file: openedFile, url: objectUrl });
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
        <div className="p-8 bg-background-color text-text-color" style={{ marginTop: 50 }}>
            <Header centralString={currentProjectTitle}/>

            <div className="flex justify-center items-center mb-8 gap-4">
                <input
                    type="text"
                    placeholder={searchInputText}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="px-4 py-2 pr-10 w-full rounded-lg border border-gray-300 text-black"
                />
                <div className="mt-0 flex items-center">
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
                            }}
                            onClick={() => document.getElementById("file-upload")?.click()}
                        >
                            Добавить файл
                        </button>
                    </label>
                </div>
            </div>

            {Object.entries(projectGroups).length === 0 ? (
                <p className="text-red-500 mb-6">Нет файлов.</p>
            ) : (
                Object.entries(projectGroups).map(([projectId, files]) => (
                    <div key={projectId} className="mb-8">
                        <div>
                            <div className="grid grid-cols-4 font-semibold border-b pb-2 mb-2">
                                <div>Имя файла</div>
                                <div>Дата изменения</div>
                                <div>Тип</div>
                                <div>Объём</div>
                            </div>
                            {files.length === 0 ? (
                                <p className="text-red-500 mb-6">Нет файлов в этом проекте.</p>
                            ) : (
                                files.map((file) => (
                                    <div
                                        key={file.id}
                                        className="grid grid-cols-4 items-center p-2 rounded-lg border hover:bg-gray-100 transition"
                                        style={{
                                            backgroundColor: selectedFileId === Number(file.id) ? "rgba(59, 130, 246, 0.2)" : "var(--button-bg)",
                                            borderColor: selectedFileId === Number(file.id) ? "#2563EB" : "var(--button-hover)",
                                            color: "inherit",
                                            cursor: "pointer",
                                            outline: selectedFileId === Number(file.id) ? "2px solid #3B82F6" : "none",
                                            outlineOffset: "-2px",
                                            transition: "all 0.2s ease"
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedFileId(Number(file.id));
                                            setContextMenuPos({x: e.clientX + 12, y: e.clientY});
                                        }}
                                    >
                                        <div>{truncateFileName(file.fileName)}</div>
                                        <div>{new Date(file.lastModified).toLocaleString()}</div>
                                        <div>{file.contentType || defineContent(file.fileName)}</div>
                                        <div>{(file.fileSize ? (file.fileSize / 1024).toFixed(2) : "0.00")} KB</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                ))
            )}

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
                            border: "none",
                            boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
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
                                borderBottom: "1px solid #eee",
                            }}
                            onClick={() => handleOpenZipFile(currentProjectId, file)}
                        >
                            Открыть
                        </div>
                        <div
                            style={{
                                padding: "8px 12px",
                                cursor: "pointer",
                                borderBottom: "1px solid #eee",
                            }}
                            onClick={() => {
                                const newName = prompt("Введите новое имя файла:", file.fileName);
                                if (newName && newName.trim() && newName !== file.fileName) {
                                    handleRenameFile(file.id, newName.trim());
                                }
                            }}
                        >
                            Переименовать
                        </div>
                        <div
                            style={{
                                padding: "8px 12px",
                                cursor: "pointer",
                                borderBottom: "1px solid #eee",
                                // color: "red",
                            }}
                            onClick={() => handleDeleteFile(file.id)}
                        >
                            Удалить
                        </div>
                        <div
                            style={{
                                padding: "8px 12px",
                                cursor: "pointer",
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
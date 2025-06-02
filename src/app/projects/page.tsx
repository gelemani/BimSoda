"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiService } from "@/app/services/api.service";
import { Project } from "@/app/config/api";
import Header from "@/app/components/header";

interface ProjectsPageProps {
    isAuthenticated: boolean;
    onSelectProject: (project: string) => void;
    companyName: string;
    registerData: { companyName: string };
}

const ProjectsPage = ({ onSelectProject = () => {} }: ProjectsPageProps) => {
    const router = useRouter();
    const [selectedProject, setSelectedProject] = useState<string>("");
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
    const [showProjectForm, setShowProjectForm] = useState(false);
    const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const searchInputText : string = 'Поиск проекта...'

    const [newProject, setNewProject] = useState<Omit<Project, "id">>({
        userId: 0,
        title: "",
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        accessLevel: "private",
        projectFiles: []
    });
    const [companyName, setCompanyName] = useState<string>(""); // companyName state
    const [userName, setUserName] = useState<string>(""); // userName state
    const searchParams = useSearchParams();
    console.log("Company Name:", companyName);

    const handleMenuToggle = (id: number) => {
        setActiveMenuId(prev => prev === id ? null : id);
    };

    const closeMenu = () => setActiveMenuId(null);

    const filteredProjects = projects.filter((proj) =>
        proj.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    useEffect(() => {
        // Fetch companyName from localStorage or query param
        if (typeof window !== "undefined") {
            const userName = localStorage.getItem("userName") || "";
            const storedCompanyName = localStorage.getItem("companyName");
            const queryCompanyName = searchParams.get("companyName");

            const finalCompanyName =
                queryCompanyName && queryCompanyName !== "null" && queryCompanyName !== "undefined"
                    ? queryCompanyName
                    : storedCompanyName || "";

            console.log("Query company:", queryCompanyName, "Stored:", storedCompanyName, "Final:", finalCompanyName);
            setUserName(userName);
            setCompanyName(finalCompanyName);
        }
        const fetchProjects = async () => {
            const userIdRaw = localStorage.getItem("userId");
            const userId = userIdRaw ? Number(userIdRaw) : 0;
            const response = await apiService.getUserProjects(userId);
            if (Array.isArray(response)) {
                setProjects(response);
            }
            setIsLoading(false);
        };
        void fetchProjects();
    }, []);

    const handleSelectProject = (project: string) => {
        setSelectedProject(project);
        onSelectProject(project);
        // Найдём объект проекта по названию (title), чтобы получить id
        const foundProject = projects.find((p) => p.title === project);
        if (foundProject) {
            localStorage.setItem("projectId", foundProject.id.toString());
            localStorage.setItem("projectTitle", foundProject.title);
        } else {
            // fallback: сохраняем только название
            localStorage.setItem("projectTitle", project);
        }
        router.push(`/projectFiles?project=${encodeURIComponent(project)}`);
    };

    const handleCreateProject = async (formData: { title: string; accessLevel: string }) => {
        if (!formData.title.trim()) {
            alert("Название проекта не может быть пустым");
            return;
        }
        const userId = parseInt(localStorage.getItem("userId") || "0", 10);
        const now = new Date().toISOString();
        const newProjectData = {
            userId,
            title: formData.title,
            createdAt: now,
            lastModified: now,
            accessLevel: formData.accessLevel,
            projectFiles: []
        };
        const result = await apiService.postUserProject(newProjectData);
        if (result) {
            setProjects(prev => {
                const updated = [...prev, result];
                // Сохраняем только что созданный проект в localStorage
                localStorage.setItem("projectId", result.id.toString());
                localStorage.setItem("projectTitle", result.title);
                return updated;
            });
            setShowProjectForm(false);
        } else {
            console.error("Ошибка создания проекта");
        }
    };

    const handleEditProject = (project: Project) => {
        setEditingProjectId(project.id);
        setNewProject({ ...project });
        setShowProjectForm(true);
    };

    // Обновление проекта: после успешного запроса получаем свежий список проектов и обновляем состояние
    const handleUpdateProject = async () => {
        if (editingProjectId === null) return;

        if (!newProject.title.trim()) {
            alert("Название проекта не может быть пустым");
            return;
        }

        const updatedProject: Project = {
            ...newProject,
            id: editingProjectId,
            lastModified: new Date().toISOString()
        };

        try {
            await apiService.putUserProject(editingProjectId, updatedProject);

            // После успешного обновления перезагружаем проекты с сервера
            const userId = parseInt(localStorage.getItem("userId") || "0");
            const freshProjects = await apiService.getUserProjects(userId);
            if (Array.isArray(freshProjects)) {
                setProjects(freshProjects);
                // Найдём только что обновлённый проект
                const updated = freshProjects.find(p => p.id === editingProjectId);
                if (updated) {
                    localStorage.setItem("projectId", updated.id.toString());
                    localStorage.setItem("projectTitle", updated.title);
                }
            }

            setEditingProjectId(null);
            setShowProjectForm(false);
        } catch {
            console.error("Ошибка обновления проекта");
        }
    };

    // Удаление проекта: после успешного удаления обновляем состояние локально
    const handleDeleteProject = async (id: number) => {
        const confirmed = confirm("Удалить проект?");
        if (!confirmed) return;

        try {
            const success = await apiService.deleteUserProject(id);
            if (success) {
                console.log("Удаляю проект с id:", id);
                console.log("Текущие проекты:", projects);
                setProjects(prev => prev.filter(project => Number(project.id) !== Number(id)));
                setSearchTerm("");
                setActiveMenuId(null);
            }
        } catch (error) {
            console.error("Ошибка при удалении проекта:", error);
        }
    };

    return (
        <div className="p-8 bg-background-color text-text-color">
            <Header centralString={companyName}/>

            <main className="mt-8">
                <div className="flex justify-center items-center mb-8 gap-4" style={{marginTop: "44px"}}>
                    <input
                        type="text"
                        placeholder={searchInputText}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="px-4 py-2 pr-10 w-full rounded-lg border border-gray-300 text-black"
                    />
                    <button
                        className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
                        onClick={() => {
                            setNewProject({
                                userId: parseInt(localStorage.getItem("userId") || "0"),
                                title: "",
                                createdAt: new Date().toISOString(),
                                lastModified: new Date().toISOString(),
                                accessLevel: "private",
                                projectFiles: []
                            });

                            setEditingProjectId(null);
                            setShowProjectForm(true);
                        }}
                    >
                        Создать проект
                    </button>
                </div>

                {isLoading ? (
                    <p className="text-center text-xl text-blue-500">Загрузка проектов...</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredProjects.length === 0 ? (
                            <div className="flex justify-center col-span-full">
                                <p className="text-center text-lg">Проекты не найдены</p>
                            </div>
                        ) : (
                            // Рендерим список проектов, обязательно указываем key={proj.id}
                            filteredProjects.map((proj) => (
                                <div key={proj.id} className="relative bg-button-bg border border-button-hover p-6 rounded-lg transition transform hover:scale-105">
                                    {activeMenuId === proj.id && (
                                        <div
                                            onClick={closeMenu}
                                            className="fixed inset-0 bg-black bg-opacity-30 z-40"
                                        />
                                    )}

                                    <div className="absolute top-2 right-2 z-50">
                                        <div className="relative">
                                            <button
                                                onClick={() => handleMenuToggle(proj.id)}
                                                className="text-white text-xl font-bold px-2 focus:outline-none"
                                            >
                                                ⋯
                                            </button>

                                            {activeMenuId === proj.id && (
                                                <div
                                                    className="flex flex-col absolute top-0 left-[-10.5rem] w-40 bg-white text-black rounded-xl shadow-xl z-50 overflow-hidden text-sm"
                                                    onMouseLeave={closeMenu}
                                                >
                                                    <button
                                                        className="px-4 py-3 text-left hover:bg-blue-500"
                                                        onClick={() => handleEditProject(proj)}
                                                    >
                                                        Редактировать
                                                    </button>
                                                    <button
                                                        className="px-4 py-3 text-left hover:bg-blue-500"
                                                        onClick={() => handleDeleteProject(proj.id)}
                                                    >
                                                        Удалить
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div onClick={() => handleSelectProject(proj.title)} className="cursor-pointer z-10 relative">
                                        <h3 className="text-2xl font-semibold">{proj.title}</h3>
                                        <p className="text-sm text-gray-600">ID пользователя: {proj.userId}</p>
                                        <div className="mt-4 text-sm text-gray-300">
                                            <p><b>Создан:</b> {new Date(proj.createdAt).toLocaleDateString()}</p>
                                            <p><b>Изменён:</b> {new Date(proj.lastModified).toLocaleDateString()}</p>
                                            <p><b>Доступ:</b> {proj.accessLevel}</p>
                                            {/*<p><b>Файлов:</b> {proj.projectFiles.length}</p>*/}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {selectedProject && (
                    <p className="text-center text-xl font-semibold mt-6">
                        Выбран проект: <b>{selectedProject}</b>
                    </p>
                )}

                {showProjectForm && (
                    <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex justify-center items-center">
                        <div style={{ background: "#242B35" }} className="rounded-lg p-6 w-[400px] text-white">
                            <h2 className="text-xl font-semibold mb-4">{editingProjectId ? "Изменить проект" : "Создать проект"}</h2>

                            <input
                                type="text"
                                placeholder="Название проекта"
                                className="w-full mb-3 p-2 border border-gray-300 rounded text-black"
                                value={newProject.title}
                                onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
                            />

                            <div className="mb-3">
                                <label className="block mb-2 font-medium">Уровень доступа:</label>
                                <div className="flex flex-col gap-2">
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="accessLevel"
                                            value="private"
                                            checked={newProject.accessLevel === "private"}
                                            onChange={(e) => setNewProject({ ...newProject, accessLevel: e.target.value })}
                                        />
                                        Приватный
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="accessLevel"
                                            value="public"
                                            checked={newProject.accessLevel === "public"}
                                            onChange={(e) => setNewProject({ ...newProject, accessLevel: e.target.value })}
                                        />
                                        Публичный
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="accessLevel"
                                            value="admin"
                                            checked={newProject.accessLevel === "admin"}
                                            onChange={(e) => setNewProject({ ...newProject, accessLevel: e.target.value })}
                                        />
                                        Администратор
                                    </label>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2">
                                <button className="px-4 py-2 bg-gray-500 rounded" onClick={() => setShowProjectForm(false)}>Отмена</button>
                                <button
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                    onClick={() => {
                                        if (editingProjectId !== null) {
                                            void handleUpdateProject();
                                        } else {
                                            void handleCreateProject({ title: newProject.title, accessLevel: newProject.accessLevel });
                                        }
                                    }}
                                >
                                    {editingProjectId ? "Сохранить" : "Создать"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default ProjectsPage;
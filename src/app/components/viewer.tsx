"use client";

import React, {JSX, useEffect, useRef, useState} from "react";
import { IfcViewerAPI } from "web-ifc-viewer";
import io from "socket.io-client";
import * as THREE from "three";
import type CameraControls from 'camera-controls';
import { gsap } from "gsap";
import {any} from "three/src/Three.TSL";
import {Material} from "three";

const socket = io("http://localhost:3002"); // или прод-адрес
// import { Color } from "three";
// import "./styles/ThemeToggler.css";
// import { apiService } from "@services/api.service"; // Здесь ты подставляешь свой правильный путь

interface Comment {
    text: string;
    elementName: string;
    elementId: number;
}

interface IfcElementProperties {
    id: number;
    Name?: { value: string };
    [key: string]: string | number | boolean | null | undefined | { value: string } | { [key: string]: string };
}


interface IfcSpatialNode {
    typeName: string;
    expressID?: number;
    children?: IfcSpatialNode[];
}

interface TreeNode {
    name: string;
    expressID?: number;
    children?: TreeNode[];
}

const mapIfcStructureToTreeNode = (ifcNode: IfcSpatialNode): TreeNode => {
    return {
        name: ifcNode.typeName || "Unnamed",
        expressID: ifcNode.expressID,
        children: ifcNode.children ? ifcNode.children.map(mapIfcStructureToTreeNode) : []
    };
};

const Viewer = ({ isAuthenticated, file }: { isAuthenticated: boolean; file?: File | null }) => {
    const [selectedElement, setSelectedElement] = useState<IfcElementProperties | null>(null);
    const [comments, setComments] = useState<Record<number, Comment[]>>({});
    const [newComment, setNewComment] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalPosition, setModalPosition] = useState({ x: 100, y: 100 });
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    // Более безопасное определение типа IFCModelType, без обращения к viewer.current
    const [modelStructure, setModelStructure] = useState<TreeNode | null>(null);
    const [exploded, setExploded] = useState(false);
    const viewer = useRef<IfcViewerAPI | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Логика перетаскивания модального окна
    useEffect(() => {
        function onMouseMove(e: MouseEvent) {
            if (!isDragging || !dragStart) return;
            const newX = e.clientX - dragStart.x;
            const newY = e.clientY - dragStart.y;
            setModalPosition({ x: newX, y: newY });
        }
        function onMouseUp() {
            setIsDragging(false);
        }
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [isDragging, dragStart]);

    useEffect(() => {
        if (isAuthenticated && containerRef.current && !viewer.current) {
            viewer.current = new IfcViewerAPI({ container: containerRef.current });
            viewer.current.grid.setGrid();
            viewer.current.axes.setAxes();
            // Настройка управления камерой
            const controls: CameraControls = viewer.current.context.ifcCamera.controls;
            const boundaryBox = new THREE.Box3(
              new THREE.Vector3(-1, -1, -1),
              new THREE.Vector3(1, 1, 1)
            );
            controls.setBoundary(boundaryBox);
            controls.azimuthAngle = 0;
            controls.maxDistance = 100;
            controls.minDistance = 1;
            controls.dollySpeed = 0.5;
            controls.setTarget(0, 0, 0); // Центр вращения (при необходимости заменить на центр модели)
            viewer.current.IFC.setWasmPath("../../../");
        }

        if (file && viewer.current) {
            const fileURL = URL.createObjectURL(file);
            viewer.current.IFC.loadIfcUrl(fileURL).then(() => {
                viewer.current!.IFC.loader.ifcManager.getSpatialStructure(0, true).then(structure => {
                    const tree = mapIfcStructureToTreeNode(structure);
                    setModelStructure(tree);
                });
            });
            viewer.current.grid.dispose();
            viewer.current.axes.dispose();
        }

        return () => {
            if (viewer.current) {
                viewer.current.dispose();
                viewer.current = null;
            }
        };
    }, [isAuthenticated, file]);

    useEffect(() => {
        const sessionId = "demo-project-room"; // можно сделать динамическим
        socket.emit("join-room", sessionId);

        socket.on("element-selected", async (element: { modelID: number; id: number }) => {
            if (viewer.current) {
                try {
                    await viewer.current.IFC.selector.highlightIfcItemsByID(element.modelID, [element.id], true, true);
                } catch (error) {
                    console.error("Error highlighting IFC item:", error);
                }
            }
        });

        return () => {
            socket.off("element-selected");
        };
    }, []);

    const startDrag = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        setIsDragging(true);
        setDragStart({
            x: e.clientX - modalPosition.x,
            y: e.clientY - modalPosition.y,
        });
    };

    // const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    //     const file = event.target.files?.[0];
    //     if (!file || !viewer.current) return;
    //     const fileURL = URL.createObjectURL(file);
    //     await viewer.current.IFC.loadIfcUrl(fileURL);
    // };

    const handleClick = async () => {
        if (!viewer.current) return;
        const result = await viewer.current.IFC.selector.pickIfcItem();
        if (result) {
            const properties = await viewer.current.IFC.loader.ifcManager.getItemProperties(result.modelID, result.id);
            setNewComment("");
            setSelectedElement(properties);
            setIsModalOpen(true);
        }
    };

    const clearSelection = () => {
        if (viewer.current) viewer.current.IFC.unpickIfcItems();
        setSelectedElement(null);
        setIsModalOpen(false);
        setNewComment("");
    };

    const saveComment = () => {
        if (!selectedElement) return;
        const elementId = selectedElement.id;
        const commentText = newComment.trim();
        if (!commentText) return;

        let elementName = "Unknown Element";
        if (selectedElement.Name && typeof selectedElement.Name === "object" && "value" in selectedElement.Name) {
            elementName = selectedElement.Name.value as string;
        }

        setComments((prevComments) => {
            const updated = { ...prevComments };
            if (!updated[elementId]) {
                updated[elementId] = [];
            }
            if (!updated[elementId].some((c) => c.text === commentText)) {
                updated[elementId].push({ text: commentText, elementName, elementId });
            }
            return updated;
        });
        setNewComment("");
    };

    const openSelectedElementJsonWindow = () => {
        if (!selectedElement) return;
        const newWindow = window.open("", "SelectedElementData", "width=600,height=400");
        if (newWindow) {
            newWindow.document.write(`
                <html>
                    <head>
                        <title>Данные выбранного элемента (JSON)</title>
                        <style>
                            body { font-family: sans-serif; padding: 10px; background: #fff; color: #000; }
                            pre { white-space: pre-wrap; word-wrap: break-word; }
                        </style>
                    </head>
                    <body>
                        <h4>Данные выбранного элемента (JSON):</h4>
                        <pre>${JSON.stringify(selectedElement, null, 2)}</pre>
                    </body>
                </html>
            `);
            newWindow.document.close();
        }
    };

    // Определяем тип IFCModelType
    type IFCModelType = NonNullable<typeof viewer.current>["context"]["items"]["pickableIfcModels"][number];

    const explodeModel = async () => {
        console.log("Explode button pressed");

        if (!viewer.current) {
            console.warn("Viewer not initialized");
            return;
        }

        const manager = viewer.current.IFC.loader.ifcManager;
        const scene = viewer.current.context.getScene();
        const meshes = viewer.current.context.items.pickableIfcModels;
        console.log("Meshes:", meshes);

        // Получаем bounding box всей модели
        const globalBox = new THREE.Box3();
        meshes.forEach((mesh) => {
            const box = new THREE.Box3().setFromObject(mesh);
            globalBox.union(box);
        });

        const modelCenter = new THREE.Vector3();
        globalBox.getCenter(modelCenter);

        // Функция для сбора expressID из геометрии mesh'ей
        const getAllExpressIDsFromGeometry = (model: IFCModelType): number[] => {
            const geometry = model.geometry;
            const idAttr = geometry.getAttribute("expressID");
            const ids = new Set<number>();
            for (let i = 0; i < idAttr.count; i++) {
                ids.add(idAttr.getX(i));
            }
            return Array.from(ids);
        };

        let allExpressIDs: number[] = [];
        for (const mesh of meshes) {
            const ids = getAllExpressIDsFromGeometry(mesh);
            allExpressIDs.push(...ids);

            // Скрываем исходную модель
            mesh.visible = false;
        }

        // Удаляем дубликаты expressID
        allExpressIDs = Array.from(new Set(allExpressIDs));
        console.log("Collected expressIDs from geometry:", allExpressIDs);

        const EXPLODE_DISTANCE = 30;

        for (const id of allExpressIDs) {
            try {
                const subset = await manager.createSubset({
                    modelID: 0,
                    ids: [id],
                    scene,
                    removePrevious: false,
                    customID: `explode-${id}`
                });

                if (subset) {
                    scene.add(subset);
                    subset.visible = true;

                    const box = new THREE.Box3().setFromObject(subset);
                    const center = new THREE.Vector3();
                    box.getCenter(center);

                    // Направление от центра элемента к центру всей модели (нормализованное)
                    const direction = new THREE.Vector3().subVectors(center, modelCenter).normalize();
                    if (direction.length() === 0 || !isFinite(direction.length())) {
                        direction.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
                    }

                    // Добавляем случайный разброс
                    const randomOffset = new THREE.Vector3(
                        (Math.random() - 0.5) * 5,
                        (Math.random() - 0.5) * 5,
                        (Math.random() - 0.5) * 5
                    );

                    const offset = direction.multiplyScalar(EXPLODE_DISTANCE).add(randomOffset);

                    gsap.to(subset.position, {
                        x: offset.x,
                        y: offset.y,
                        z: offset.z,
                        duration: 2
                    });

                    // Для дебага можно добавить подсветку
                    // const boxHelper = new THREE.BoxHelper(subset, 0xff0000);
                    // scene.add(boxHelper);

                    console.log(`Subset ID ${id} animated to`, offset);
                }
            } catch (e) {
                console.error(`Failed to create or animate subset for ID ${id}`, e);
            }
        }
    };

    const resetExplodeModel = async () => {
        if (!viewer.current) return;

        const meshes = viewer.current.context.items.pickableIfcModels;
        const manager = viewer.current.IFC.loader.ifcManager;

        for (const mesh of meshes) {
            // Показываем исходную модель
            mesh.visible = true;

            // Собираем все expressID из геометрии
            const geometry = mesh.geometry;
            const idAttr = geometry.getAttribute("expressID");
            const ids = new Set<number>();
            for (let i = 0; i < idAttr.count; i++) {
                ids.add(idAttr.getX(i));
            }

            // Сбрасываем позицию subset'ов с анимацией
            for (const id of ids) {
                const subset = manager.getSubset(0, undefined, `explode-${id}`);
                if (!subset) {
                    console.warn(`No subset found for explode-${id}`);
                    continue;
                }
                gsap.to(subset.position, { x: 0, y: 0, z: 0, duration: 1 });
            }
        }
    };

    // --- Стоимость элементов ---
const getElementCost = async (modelID: number, expressID: number): Promise<string | null> => {
    const manager = viewer.current!.IFC.loader.ifcManager;

    const props = await manager.getItemProperties(modelID, expressID);
    const psets = await manager.getPropertySets(modelID, expressID, true);

    if (props.Cost) {
        console.log(`Found cost in props.Cost for ID ${expressID}:`, props.Cost.value);
        return String(props.Cost.value);
    }
    if (props.Цена) {
        console.log(`Found cost in props.Цена for ID ${expressID}:`, props.Цена.value);
        return String(props.Цена.value);
    }
    if (props.Стоимость) {
        console.log(`Found cost in props.Стоимость for ID ${expressID}:`, props.Стоимость.value);
        return String(props.Стоимость.value);
    }

    for (const setName in psets) {
        const set = psets[setName];
        console.log(`Fetching properties for ID ${expressID}`);
        console.log("props:", props);
        console.log("psets:", psets);
        for (const propName in set) {
            if (
                [
                    "Cost",
                    "Цена",
                    "Стоимость",
                    "BaseQuantities",
                    "NetCost",
                    "GrossCost"
                ].includes(propName)
            ) {
                const val = set[propName];
                if (val && typeof val === "object" && "value" in val) {
                    console.log(`Found cost in psets[${setName}][${propName}] for ID ${expressID}:`, val.value);
                    return String(val.value);
                }
            }
        }
    }
    return null;
};

    useEffect(() => {
        if (!viewer.current) return;

        const manager = viewer.current.IFC.loader.ifcManager;
        const models = viewer.current.context.items.pickableIfcModels;

        (async () => {
            for (const model of models) {
                const modelID = model.modelID;
                const geometry = model.geometry;
                const idAttr = geometry.getAttribute("expressID");
                const ids = new Set<number>();
                for (let i = 0; i < idAttr.count; i++) {
                    ids.add(idAttr.getX(i));
                }

                for (const id of ids) {
                    const cost = await getElementCost(modelID, id);
                    if (cost !== null) {
                        console.log(`Element ID ${id}: стоимость = ${cost}`);
                    }
                }
            }
        })();
    }, []);

    const renderTree = (node: TreeNode): React.ReactElement => {
        const toggleVisibility = async (visible: boolean) => {
            if (!viewer.current || node.expressID === undefined) return;
            const manager = viewer.current.IFC.loader.ifcManager;
            const model = viewer.current.context.items.pickableIfcModels[0];
            const modelID = model.modelID;

            // Define the hide material
            const hideMaterial = new THREE.MeshBasicMaterial({
                color: 0xcccccc,
                transparent: true,
                opacity: 0.2,
            });

            try {
                const geometry = model.geometry;
                const idAttr = geometry.getAttribute("expressID");
                const allIDs = new Set<number>();
                for (let i = 0; i < idAttr.count; i++) {
                    allIDs.add(idAttr.getX(i));
                }

                const idsToHide = Array.from(allIDs).filter(id => id !== node.expressID);

                const existing = manager.getSubset(modelID, hideMaterial, `hide-others-${node.expressID}`);
                if (existing) {
                    existing.visible = visible;
                    return;
                }

                if (!visible) {
                    const subset = await manager.createSubset({
                        modelID,
                        ids: idsToHide,
                        material: hideMaterial,
                        scene: viewer.current.context.scene.scene,
                        removePrevious: false,
                        customID: `hide-others-${node.expressID}`
                    });
                    subset.visible = true;
                }
            } catch (error) {
                console.error("Error in toggleVisibility:", error);
            }
        };

        return (
            <li>
                <label style={{ cursor: "pointer" }}>
                    <input
                        type="checkbox"
                        defaultChecked
                        onChange={(e) => toggleVisibility(e.target.checked)}
                        style={{ marginRight: "4px" }}
                    />
                    <span
                        onClick={() => {
                            if (viewer.current && node.expressID !== undefined) {
                                viewer.current.IFC.selector.highlightIfcItemsByID(0, [node.expressID], true, true);
                            }
                        }}
                    >
                        {node.name}
                    </span>
                </label>
                {node.children && node.children.length > 0 && (
                    <ul>
                        {node.children.map((child) => (
                            <React.Fragment key={child.expressID}>
                                {renderTree(child)}
                            </React.Fragment>
                        ))}
                    </ul>
                )}
            </li>
        );
    };

    return (
        <>
            {isAuthenticated && (
                <>
                    {/*<div className="header-container">*/}
                    {/*    <button className="button blue-button">Обычный режим</button>*/}
                    {/*    <button className="button">Режим просмотра элементов</button>*/}
                    {/*</div>*/}
                    {/*<label className="custom-file-upload">*/}
                    {/*    <input type="file" accept=".ifc" onChange={handleFileUpload} />*/}
                    {/*    Загрузить файл*/}
                    {/*</label>*/}
                    <button
                        onClick={() =>
                            setExploded(prev => {
                                if (prev) resetExplodeModel();
                                else explodeModel();
                                return !prev;
                            })
                        }
                        style={{ position: 'absolute', zIndex: 10, top: 10, right: 10 }}
                    >
                        Toggle Explode
                    </button>
                    {/*<button*/}
                    {/*    onClick={logAllElementsCosts}*/}
                    {/*    style={{ position: 'absolute', zIndex: 10, top: 50, right: 10 }}*/}
                    {/*>*/}
                    {/*    Log Element Costs*/}
                    {/*</button>*/}
                    <div style={{ position: 'absolute', left: 10, top: 10, zIndex: 10, background: 'white', padding: '10px', maxHeight: '90vh', overflow: 'auto' }}>
                        <h4>Model Tree</h4>
                        <ul>
                            {modelStructure && renderTree(modelStructure)}
                        </ul>
                    </div>
                    <div ref={containerRef} className="viewer-container" onClick={handleClick}></div>
                    {isModalOpen && selectedElement && (
                        <div
                            className="modal-container"
                            style={{ backgroundColor: "#CFC9CC", left: modalPosition.x, top: modalPosition.y }}
                        >
                            <div className="modal-header" onMouseDown={startDrag}>
                                <div className="modal-title">
                                    <h3>Комментарии</h3>
                                    <button className="modal-close" onClick={clearSelection}>
                                        &times;
                                    </button>
                                </div>
                            </div>
                            <textarea
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder="Введите комментарий..."
                                style={{backgroundColor: "#A9A9A9", color: "black"}}
                                className="modal-textarea"
                            />
                            <div className="modal-buttons">
                                <button className="save" onClick={saveComment}>
                                    Сохранить
                                </button>
                                <button className="button modal-json-button" onClick={openSelectedElementJsonWindow}>
                                    Открыть JSON
                                </button>
                            </div>
                            <div className="modal-comments">
                                <h4>Комментарии:</h4>
                                <ul>
                                    {comments[selectedElement.id]?.map((comment, index) => (
                                        <li key={index}>
                                            <strong>{comment.elementName}</strong>: {comment.text}
                                        </li>
                                    )) || <li>Нет комментариев</li>}
                                </ul>
                            </div>
                        </div>
                    )}
                </>
            )}
        </>
    );
};

export default Viewer;
"use client"

import React, { useEffect, useRef, useState, useCallback } from "react";
import { IfcViewerAPI } from "web-ifc-viewer";
import io from "socket.io-client";
import * as THREE from "three";
import { gsap } from "gsap";

const socket = io("http://localhost:3002");

interface Comment {
    text: string;
    elementName: string;
    elementId: number;
}

interface IfcElementProperties {
    id: number;
    Name?: { value: string };
    [key: string]: any;
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

const mapIfcStructureToTreeNode = (node: IfcSpatialNode): TreeNode => ({
    name: node.typeName || "Unnamed",
    expressID: node.expressID,
    children: node.children ? node.children.map(mapIfcStructureToTreeNode) : [],
});

// Асинхронное преобразование структуры IFC в дерево с именами из свойств Name
async function mapIfcStructureToTreeNodeWithNames(
    ifcManager: any,
    modelID: number,
    node: IfcSpatialNode
): Promise<TreeNode> {
    let name = node.typeName || "Unnamed";

    if (node.expressID !== undefined) {
        try {
            const props = await ifcManager.getItemProperties(modelID, node.expressID, true);
            if (props?.Name?.value) {
                name = props.Name.value;
            }
        } catch {
            // ignore errors
        }
    }

    let children: TreeNode[] = [];
    if (node.children && node.children.length > 0) {
        children = await Promise.all(
            node.children.map((child) => mapIfcStructureToTreeNodeWithNames(ifcManager, modelID, child))
        );
    }

    return {
        name,
        expressID: node.expressID,
        children,
    };
}

const hideMaterial = new THREE.MeshBasicMaterial({
    color: 0xcccccc,
    transparent: true,
    opacity: 0.2,
});

const Viewer = ({
                    isAuthenticated,
                    file,
                }: {
    isAuthenticated: boolean;
    file?: File | null;
}) => {
    const [selectedElement, setSelectedElement] = useState<IfcElementProperties | null>(null);
    const [comments, setComments] = useState<Record<string, Comment[]>>({});
    const [newComment, setNewComment] = useState("");
    const [selectedCommentsId, setSelectedCommentsId] = React.useState<number | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalPosition, setModalPosition] = useState({ x: 100, y: 100 });
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [modelStructure, setModelStructure] = useState<TreeNode | null>(null);
    let [exploded, setExploded] = useState(false);
    const [isTreeCollapsed, setIsTreeCollapsed] = useState(true);
    const toggleTreeCollapsed = () => setIsTreeCollapsed((prev) => !prev);
    const [selectedIDs, setSelectedIDs] = useState<Set<number>>(new Set());
    const viewer = useRef<IfcViewerAPI | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging || !dragStart) return;
            setModalPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        };
        const onMouseUp = () => setIsDragging(false);
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [isDragging, dragStart]);

    useEffect(() => {
        if (!isAuthenticated || !containerRef.current) return;
        if (!viewer.current) {
            viewer.current = new IfcViewerAPI({ container: containerRef.current });
            viewer.current.grid.setGrid();
            viewer.current.axes.setAxes();
            const controls = viewer.current.context.ifcCamera.controls;
            controls.setBoundary(new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)));
            controls.azimuthAngle = 0;
            controls.maxDistance = 100;
            controls.minDistance = 1;
            controls.dollySpeed = 0.5;
            controls.setTarget(0, 0, 0);
            viewer.current.IFC.setWasmPath("../../../");

            // Add safe keyboard event handler
            const handleKeyDown = (e: KeyboardEvent) => {
                if (!e || typeof e.key !== 'string') return;
                const key = e.key.toLowerCase();
                // Handle keyboard events here
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => {
                window.removeEventListener('keydown', handleKeyDown);
            };
        }
        if (file && viewer.current) {
            const fileURL = URL.createObjectURL(file);
            viewer.current.IFC.loadIfcUrl(fileURL).then(async () => {
                const structure = await viewer.current!.IFC.loader.ifcManager.getSpatialStructure(0, true);
                const tree = await mapIfcStructureToTreeNodeWithNames(
                    viewer.current!.IFC.loader.ifcManager,
                    0,
                    structure
                );
                setModelStructure(tree);
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
        const sessionId = "demo-project-room";
        socket.emit("join-room", sessionId);
        const onElementSelected = async (element: { modelID: number; id: number }) => {
            if (!viewer.current) return;
            try {
                await viewer.current.IFC.selector.highlightIfcItemsByID(element.modelID, [element.id], true, true);
            } catch {
                // ignore
            }
        };
        socket.on("element-selected", onElementSelected);
        return () => {
            socket.off("element-selected", onElementSelected);
        };
    }, []);

    const startDrag = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (e.button !== 0) return;
            setIsDragging(true);
            setDragStart({ x: e.clientX - modalPosition.x, y: e.clientY - modalPosition.y });
        },
        [modalPosition]
    );

    const handleClick = useCallback(async () => {
        if (!viewer.current || !modelStructure) return;
        const result = await viewer.current.IFC.selector.pickIfcItem();
        if (!result) return;

        const found = viewer.current.context.items.pickableIfcModels.some(model => {
            return model.visible && model.geometry.getAttribute("expressID")?.array.includes(result.id);
        });
        if (!found && !isTreeCollapsed) return;

        const properties = await viewer.current.IFC.loader.ifcManager.getItemProperties(result.modelID, result.id);
        if (!('id' in properties)) {
            properties.id = result.id;
        }
        console.log("Выбранный элемент свойства:", properties);
        setSelectedElement(properties);
        setNewComment("");
        setIsModalOpen(true);
    }, [isTreeCollapsed, modelStructure]);

    const clearSelection = useCallback(() => {
        viewer.current?.IFC.unpickIfcItems();
        setSelectedElement(null);
        setIsModalOpen(false);
        setNewComment("");
    }, []);

    const saveComment = useCallback(() => {
        if (!selectedElement) return;
        const elementId = selectedElement.id;
        const commentText = newComment.trim();
        if (!commentText) return;
        const elementName =
            selectedElement.Name && typeof selectedElement.Name === "object" && "value" in selectedElement.Name
                ? selectedElement.Name.value
                : "Unknown Element";
        console.log("Сохраняем комментарий:", {
            elementId,
            elementName,
            commentText,
        });
        const elementIdStr = String(elementId);
        setComments((prev) => {
            const updated = { ...prev };
            if (!updated[elementIdStr]) updated[elementIdStr] = [];
            if (!updated[elementIdStr].some((c) => c.text === commentText)) {
                updated[elementIdStr].push({ text: commentText, elementName, elementId });
            }
            return updated;
        });
        // setNewComment("");
    }, [newComment, selectedElement]);

    const openSelectedElementJsonWindow = useCallback(() => {
        if (!selectedElement) return;
        const newWindow = window.open("", "SelectedElementData", "width=600,height=400");
        if (!newWindow) return;
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
    }, [selectedElement]);

    const explodeModel = useCallback(async () => {
        if (!viewer.current) return;

        const manager = viewer.current.IFC.loader.ifcManager;
        const scene = viewer.current.context.getScene();
        const meshes = viewer.current.context.items.pickableIfcModels;

        if (meshes.length === 0) return;

        const globalBox = new THREE.Box3();
        meshes.forEach((mesh) => globalBox.union(new THREE.Box3().setFromObject(mesh)));

        const modelCenter = new THREE.Vector3();
        globalBox.getCenter(modelCenter);

        const getAllExpressIDsFromGeometry = (mesh: typeof meshes[number]) => {
            const idAttr = mesh.geometry.getAttribute("expressID");
            const ids = new Set<number>();
            for (let i = 0; i < idAttr.count; i++) {
                ids.add(idAttr.getX(i));
            }
            return Array.from(ids);
        };

        let allExpressIDs: number[] = [];
        for (const mesh of meshes) {
            allExpressIDs.push(...getAllExpressIDsFromGeometry(mesh));
            mesh.visible = false; // Скрываем оригинальные меши
        }

        allExpressIDs = Array.from(new Set(allExpressIDs));

        // 6 фиксированных направлений (вектора)
        const directions = [
            new THREE.Vector3(1, 0, 0),   // +X
            new THREE.Vector3(-1, 0, 0),  // -X
            new THREE.Vector3(0, 1, 0),   // +Y
            new THREE.Vector3(0, -1, 0),  // -Y
            new THREE.Vector3(0, 0, 1),   // +Z
            new THREE.Vector3(0, 0, -1)   // -Z
        ];

        const EXPLODE_DISTANCE = 10; // Расстояние разлёта

        for (let i = 0; i < allExpressIDs.length; i++) {
            const id = allExpressIDs[i];
            try {
                const subset = await manager.createSubset({
                    modelID: 0,
                    ids: [id],
                    scene,
                    removePrevious: false,
                    customID: `explode-${id}`,
                });

                if (!subset) continue;

                scene.add(subset);
                subset.visible = true;

                // Выбираем направление по индексу (по очереди)
                const direction = directions[i % directions.length];

                // Применяем смещение
                const offset = direction.clone().multiplyScalar(EXPLODE_DISTANCE);

                gsap.to(subset.position, {
                    x: offset.x,
                    y: offset.y,
                    z: offset.z,
                    duration: 2,
                    ease: "power2.out"
                });

            } catch (e) {
                console.warn("Ошибка при разборке элемента", id, e);
            }
        }
    }, []);

    const resetExplodeModel = useCallback(async () => {
        if (!viewer.current) return;
        const manager = viewer.current.IFC.loader.ifcManager;
        const meshes = viewer.current.context.items.pickableIfcModels;
        for (const mesh of meshes) {
            mesh.visible = true;
            const idAttr = mesh.geometry.getAttribute("expressID");
            const ids = new Set<number>();
            for (let i = 0; i < idAttr.count; i++) ids.add(idAttr.getX(i));
            for (const id of ids) {
                const subset = manager.getSubset(0, undefined, `explode-${id}`);
                if (!subset) continue;
                gsap.to(subset.position, { x: 0, y: 0, z: 0, duration: 1 });
            }
        }
    }, []);

    const TreeNodeComponent = ({
                                   node,
                                   selectedIDs,
                                   setSelectedIDs,
                               }: {
        node: TreeNode;
        selectedIDs: Set<number>;
        setSelectedIDs: React.Dispatch<React.SetStateAction<Set<number>>>;
    }) => {
        const [expanded, setExpanded] = React.useState(true);

        const selected = selectedIDs.has(node.expressID ?? -1);
        const hasChildren = node.children && node.children.length > 0;
        const toggleExpanded = () => setExpanded(!expanded);

        const handleSelect = async () => {
            if (!viewer.current || node.expressID === undefined) return;

            const manager = viewer.current.IFC.loader.ifcManager;
            const scene = viewer.current.context.getScene();
            const model = viewer.current.context.items.pickableIfcModels[0];
            const modelID = model.modelID;
            const subsetId = `show-only-${node.expressID}`;

            try {
                const maybeSubset = scene.children.find(obj => obj.name === subsetId);
                if (maybeSubset) {
                    scene.remove(maybeSubset);
                    model.visible = true;

                    setSelectedIDs(prev => {
                        const updated = new Set(prev);
                        updated.delete(node.expressID!);
                        return updated;
                    });

                    return;
                }

                model.visible = false;

                const subset = await manager.createSubset({
                    modelID,
                    ids: [node.expressID],
                    material: undefined,
                    scene,
                    removePrevious: false,
                    customID: subsetId,
                });

                if (subset) {
                    subset.name = subsetId;
                    subset.visible = true;

                    setSelectedIDs(prev => {
                        const updated = new Set(prev);
                        updated.add(node.expressID!);
                        return updated;
                    });
                }
            } catch (err) {
                console.warn("Subset creation/removal failed:", err);
            }
        };

        return (
            <li>
                <div className="model-tree-row">
                    {hasChildren ? (
                        <div
                            onClick={toggleExpanded}
                            className="model-tree-arrow"
                            aria-label={expanded ? "Collapse" : "Expand"}
                        >
                            {expanded ? "▼" : "▶"}
                        </div>
                    ) : (
                        <div className="model-tree-arrow" />
                    )}
                    <span
                        className={`model-tree-name${selected ? " selected" : ""}`}
                        onClick={handleSelect}
                    >
                    {node.name}
                </span>
                </div>
                {hasChildren && expanded && (
                    <ul className="model-tree-children">
                        {node.children!.map((child) => (
                            <TreeNodeComponent
                                key={child.expressID}
                                node={child}
                                selectedIDs={selectedIDs}
                                setSelectedIDs={setSelectedIDs}
                            />
                        ))}
                    </ul>
                )}
            </li>
        );
    };

    function clearSelectionTree() {
        if (!viewer.current) return;
        const scene = viewer.current.context.getScene();
        const model = viewer.current.context.items.pickableIfcModels[0];
        if (!model) return;

        const toRemove = scene.children.filter(child => child.name.startsWith("show-only-"));
        for (const subset of toRemove) {
            scene.remove(subset);
        }

        model.visible = true;
        setSelectedIDs(new Set());
    }

    return (
        <>
            {isAuthenticated && (
                <>
                    {/* Панель управления снизу */}
                    <div
                        style={{
                            position: "absolute",
                            bottom: 20,
                            left: "50%",
                            transform: "translateX(-50%)",
                            zIndex: 15,
                            display: "flex",
                            gap: 12,
                            backgroundColor: "#1F252E",
                            padding: "10px 20px",
                            borderRadius: 8,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                            border: "1px solid #ccc"
                        }}
                    >
                        <button
                            onClick={() => {
                                if (exploded) resetExplodeModel();
                                else explodeModel();
                                setExploded((prev) => !prev);
                            }}
                            style={{
                                background: "#2C333A",
                                color: "white",
                                // border: "1px solid white",
                                padding: "6px 12px",
                                borderRadius: 4,
                                cursor: "pointer"
                            }}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </button>

                        <button
                            onClick={async () => {
                                if (!viewer.current) return;

                                try {
                                    const viewerInstance = viewer.current;
                                    const model = viewerInstance.context.items.pickableIfcModels[0];
                                    if (!model) return;

                                    model.visible = true;

                                    const scene = viewerInstance.context.getScene();
                                    const toRemove = scene.children.filter(obj => obj.name?.startsWith("show-only-"));
                                    toRemove.forEach(obj => scene.remove(obj));

                                    await viewerInstance.IFC.selector.unpickIfcItems();

                                    const manager = viewerInstance.IFC.loader.ifcManager;
                                    const allIDs = await manager.getAllItemsOfType(model.modelID, -1, false);
                                    await manager.createSubset({
                                        modelID: model.modelID,
                                        ids: allIDs.map(item => item.expressID),
                                        removePrevious: true,
                                        customID: `reset-visibility-${model.modelID}`
                                    });

                                    resetExplodeModel();
                                    setExploded(false);
                                    clearSelectionTree();
                                    setSelectedElement(null);
                                    setIsModalOpen(false);
                                    setNewComment("");
                                } catch (err) {
                                    console.error("Ошибка при сбросе модели:", err);
                                }
                            }}
                            style={{
                                background: "#2C333A",
                                color: "white",
                                padding: "6px 12px",
                                borderRadius: 4,
                                cursor: "pointer"
                            }}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>
                    {/* Панель Model Tree с перетаскиванием */}
                    <div
                        style={{
                            position: "absolute",
                            left: 0,
                            top: 42,
                            zIndex: 20,
                            background: "#1F252E",
                            padding: 0,
                            maxHeight: "90vh",
                            overflow: "auto",
                            fontFamily: "Arial, sans-serif",
                            fontSize: 14,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.13)",
                            minWidth: 240,
                            borderRadius: 6,
                            border: "1px solid #ccc",
                            color: "#fff"
                        }}
                    >
                        <div
                            style={{
                                background: "#2C333A",
                                borderBottom: "1px solid #444",
                                padding: "8px 12px",
                                userSelect: "none",
                                fontWeight: 600,
                                borderRadius: "6px 6px 0 0",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between"
                            }}
                        >
                            <span>Структура модели</span>
                            <button
                                onClick={toggleTreeCollapsed}
                                style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "#fff",
                                    cursor: "pointer",
                                    fontSize: 16
                                }}
                                aria-label="Collapse Tree"
                            >
                                {isTreeCollapsed ? "▶" : "▼"}
                            </button>
                        </div>
                        {!isTreeCollapsed && (
                            <div style={{padding: 10}}>
                                <ul style={{paddingLeft: 0, marginTop: 0}}>
                                    {modelStructure && <TreeNodeComponent
                                        node={modelStructure}
                                        selectedIDs={selectedIDs}
                                        setSelectedIDs={setSelectedIDs}
                                    />}
                                </ul>
                            </div>
                        )}
                    </div>

                    <div ref={containerRef} className="viewer-container" onClick={handleClick}/>
                    {isModalOpen && selectedElement && (
                        <div
                            className="modal-container"
                            style={{backgroundColor: "#CFC9CC", left: modalPosition.x, top: modalPosition.y}}
                        >
                            <div className="modal-header" onMouseDown={startDrag}>
                                <div className="modal-title">
                                    <h3 style={{fontSize: "20px", fontWeight: "500", marginBottom: "10px"}}>
                                        Комментарии
                                    </h3>
                                    <button className="modal-close" onClick={clearSelection}>
                                        &times;
                                    </button>
                                </div>
                            </div>
                            <textarea
                                className="modal-textarea"
                                style={{backgroundColor: "#A9A9A9", color: "black"}}
                                placeholder="Введите комментарий..."
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
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
                                    {Object.keys(comments).length === 0 ? (
                                        <li>Нет комментариев</li>
                                    ) : (
                                        Object.entries(comments).map(([elementId, commentList]) =>
                                            commentList.map((comment, i) => (
                                                <li key={`${elementId}-${i}`}>
                                                    <strong
                                                        style={{cursor: "pointer", textDecoration: "underline"}}
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (!viewer.current) return;
                                                            try {
                                                                const model = viewer.current.context.items.pickableIfcModels[0];
                                                                model.visible = true;
                                                                await viewer.current.IFC.selector.unpickIfcItems();
                                                                await viewer.current.IFC.selector.highlightIfcItemsByID(
                                                                    model.modelID,
                                                                    [comment.elementId],
                                                                    true,
                                                                    true
                                                                );
                                                                const props = await viewer.current.IFC.loader.ifcManager.getItemProperties(
                                                                    model.modelID,
                                                                    comment.elementId
                                                                );
                                                                setSelectedElement(props);
                                                            } catch (err) {
                                                                console.warn(err);
                                                            }
                                                        }}
                                                    >
                                                        {comment.elementName}
                                                    </strong>
                                                    : {comment.text}
                                                </li>
                                            ))
                                        )
                                    )}
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
"use client";

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
    const [comments, setComments] = useState<Record<number, Comment[]>>({});
    const [newComment, setNewComment] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalPosition, setModalPosition] = useState({ x: 100, y: 100 });
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    // --- Model Tree drag state ---
    // Позиция панели дерева модели
    const [treePosition, setTreePosition] = useState<{ x: number; y: number }>({ x: 10, y: 10 });
    const [treeDragStart, setTreeDragStart] = useState<{ x: number; y: number } | null>(null);
    const [isTreeDragging, setIsTreeDragging] = useState(false);
    const [modelStructure, setModelStructure] = useState<TreeNode | null>(null);
    const [exploded, setExploded] = useState(false);
    // --- Model Tree collapsed state ---
    const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);
    const toggleTreeCollapsed = () => setIsTreeCollapsed((prev) => !prev);

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
        // Обработчик движения мыши для перетаскивания панели дерева
        const onTreeMouseMove = (e: MouseEvent) => {
            if (!isTreeDragging || !treeDragStart) return;
            setTreePosition({ x: e.clientX - treeDragStart.x, y: e.clientY - treeDragStart.y });
        };
        const onTreeMouseUp = () => setIsTreeDragging(false);
        window.addEventListener("mousemove", onTreeMouseMove);
        window.addEventListener("mouseup", onTreeMouseUp);
        return () => {
            window.removeEventListener("mousemove", onTreeMouseMove);
            window.removeEventListener("mouseup", onTreeMouseUp);
        };
    }, [isTreeDragging, treeDragStart]);

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

    // --- Modal window drag start handler ---
    const startDrag = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (e.button !== 0) return;
            setIsDragging(true);
            setDragStart({ x: e.clientX - modalPosition.x, y: e.clientY - modalPosition.y });
        },
        [modalPosition]
    );

    // --- Model Tree drag start handler ---
    const startTreeDrag = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (e.button !== 0) return;
            setIsTreeDragging(true);
            setTreeDragStart({ x: e.clientX - treePosition.x, y: e.clientY - treePosition.y });
        },
        [treePosition]
    );

    const handleClick = useCallback(async () => {
        if (!viewer.current) return;
        const result = await viewer.current.IFC.selector.pickIfcItem();
        if (!result) return;
        const properties = await viewer.current.IFC.loader.ifcManager.getItemProperties(result.modelID, result.id);
        setSelectedElement(properties);
        setNewComment("");
        setIsModalOpen(true);
    }, []);

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
        setComments((prev) => {
            const updated = { ...prev };
            if (!updated[elementId]) updated[elementId] = [];
            if (!updated[elementId].some((c) => c.text === commentText)) {
                updated[elementId].push({ text: commentText, elementName, elementId });
            }
            return updated;
        });
        setNewComment("");
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
        const globalBox = new THREE.Box3();
        meshes.forEach((mesh) => globalBox.union(new THREE.Box3().setFromObject(mesh)));
        const modelCenter = new THREE.Vector3();
        globalBox.getCenter(modelCenter);
        const getAllExpressIDsFromGeometry = (mesh: typeof meshes[number]) => {
            const idAttr = mesh.geometry.getAttribute("expressID");
            const ids = new Set<number>();
            for (let i = 0; i < idAttr.count; i++) ids.add(idAttr.getX(i));
            return Array.from(ids);
        };
        let allExpressIDs: number[] = [];
        for (const mesh of meshes) {
            allExpressIDs.push(...getAllExpressIDsFromGeometry(mesh));
            mesh.visible = false;
        }
        allExpressIDs = Array.from(new Set(allExpressIDs));
        const EXPLODE_DISTANCE = 30;
        for (const id of allExpressIDs) {
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
                const box = new THREE.Box3().setFromObject(subset);
                const center = new THREE.Vector3();
                box.getCenter(center);
                const direction = new THREE.Vector3().subVectors(center, modelCenter).normalize();
                if (!direction.length() || !isFinite(direction.length())) {
                    direction.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
                }
                const randomOffset = new THREE.Vector3(
                    (Math.random() - 0.5) * 5,
                    (Math.random() - 0.5) * 5,
                    (Math.random() - 0.5) * 5
                );
                const offset = direction.multiplyScalar(EXPLODE_DISTANCE).add(randomOffset);
                gsap.to(subset.position, { x: offset.x, y: offset.y, z: offset.z, duration: 2 });
            } catch (e) {
                // ignore
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

    const TreeNodeComponent = ({ node }: { node: TreeNode }) => {
        const [expanded, setExpanded] = React.useState(true);
        const [selected, setSelected] = React.useState(false);
        const [hovered, setHovered] = React.useState(false);

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
            // Remove previous subset if exists
            const maybeSubset = scene.children.find(obj => obj.name === subsetId);
            if (maybeSubset) {
              scene.remove(maybeSubset);
              model.visible = true;
              setSelected(false);
              return;
            }

            // Hide main mesh
            model.visible = false;

            // Create subset only with selected element
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
              setSelected(true);
            } else {
              console.warn("Subset creation returned null");
            }
          } catch (err) {
            console.warn("Subset creation/removal failed:", err);
          }
        };

        const handleMouseEnter = () => {
            setHovered(true);
        };
        const handleMouseLeave = () => {
            setHovered(false);
        };

        return (
            <li>
                <div
                    className="model-tree-row"
                >
                    {hasChildren ? (
                        <div
                            onClick={toggleExpanded}
                            className="model-tree-arrow"
                            aria-label={expanded ? "Collapse" : "Expand"}
                        >
                            {expanded ? "▼" : "▶"}
                        </div>
                    ) : (
                        <div className="model-tree-arrow"/>
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
                            <TreeNodeComponent key={child.expressID} node={child}/>
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
                    <button
                        onClick={() => {
                            if (exploded) resetExplodeModel();
                            else explodeModel();
                            setExploded((prev) => !prev);
                        }}
                        style={{ position: "absolute", zIndex: 10, top: 10, right: 10 }}
                    >
                        Toggle Explode
                    </button>
                    {/* Панель Model Tree с перетаскиванием */}
                    <div
                      style={{
                        position: "absolute",
                        left: treePosition.x,
                        top: treePosition.y,
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
                          cursor: isTreeDragging ? "grabbing" : "grab",
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
                        onMouseDown={startTreeDrag}
                      >
                        <span>Model Tree</span>
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
                        <div style={{ padding: 10 }}>
                          <ul style={{ paddingLeft: 0, marginTop: 0 }}>
                            {modelStructure && <TreeNodeComponent node={modelStructure} />}
                          </ul>
                        </div>
                      )}
                    </div>
                    <div ref={containerRef} className="viewer-container" onClick={handleClick} />
                    {isModalOpen && selectedElement && (
                        <div
                            className="modal-container"
                            style={{ backgroundColor: "#CFC9CC", left: modalPosition.x, top: modalPosition.y }}
                        >
                            <div className="modal-header" onMouseDown={startDrag}>
                                <div className="modal-title">
                                    <h3 style={{ fontSize: "20px", fontWeight: "500", marginBottom: "10px" }}>
                                        Комментарии
                                    </h3>
                                    <button className="modal-close" onClick={clearSelection}>
                                        &times;
                                    </button>
                                </div>
                            </div>
                            <textarea
                                className="modal-textarea"
                                style={{ backgroundColor: "#A9A9A9", color: "black" }}
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
                                    {comments[selectedElement.id]?.map((comment, i) => (
                                        <li key={i}>
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
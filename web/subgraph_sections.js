import { app } from "../../scripts/app.js";

const PROPERTY_NAME = "utopik_socket_sections";
const SECTION_HEADER_HEIGHT = 18;
const SECTION_GAP = 4;
const SLOT_ROW_HEIGHT = 20;
const SLOT_START_Y = 34;
const originalPositions = new WeakMap();
const nativeStartPositions = new WeakMap();
let sectionCounter = 0;

export function createPortLayout(inputs, outputs, config, rowHeight = SLOT_ROW_HEIGHT, headerHeight = SECTION_HEADER_HEIGHT, startY = SLOT_START_Y) {
    const sections = Array.isArray(config?.sections) ? config.sections.filter(section => section?.id && section?.label) : [];
    const inputStartY = typeof startY === "number" ? startY : (startY?.inputs ?? SLOT_START_Y);
    const outputStartY = typeof startY === "number" ? startY : (startY?.outputs ?? SLOT_START_Y);

    function layoutSide(ports, assignments, sideStartY) {
        const positions = Array(ports.length).fill(null);
        const headers = [];
        let y = sideStartY;

        for (const section of sections) {
            const indexes = ports.flatMap((port, index) => assignments?.[port.name] === section.id ? [index] : []);
            if (!indexes.length) continue;
            headers.push({ label: section.label, y });
            y += headerHeight;
            for (const index of indexes) {
                positions[index] = y + rowHeight / 2;
                y += rowHeight;
            }
            y += SECTION_GAP;
        }

        for (let index = 0; index < ports.length; index += 1) {
            if (positions[index] !== null) continue;
            positions[index] = y + rowHeight / 2;
            y += rowHeight;
        }

        return { positions, headers, endY: y + 8 };
    }

    const inputLayout = layoutSide(inputs, config?.assignments?.inputs, inputStartY);
    const outputLayout = layoutSide(outputs, config?.assignments?.outputs, outputStartY);
    return {
        inputs: inputLayout,
        outputs: outputLayout,
        height: Math.max(inputLayout.endY, outputLayout.endY),
    };
}

function nodeConfig(node) {
    return node.properties?.[PROPERTY_NAME] ?? { sections: [], assignments: { inputs: {}, outputs: {} } };
}

function inputSockets(node) {
    return (node.inputs ?? []).filter(input => !input.widgetId && !input._widget);
}

function hasAssignedSection(node, config) {
    const sectionIds = new Set((config.sections ?? []).map(section => section?.id).filter(Boolean));
    return inputSockets(node).some(input => sectionIds.has(config.assignments?.inputs?.[input.name]))
        || (node.outputs ?? []).some(output => sectionIds.has(config.assignments?.outputs?.[output.name]));
}

function nativeStartY(node, isInput) {
    let starts = nativeStartPositions.get(node);
    if (!starts) {
        starts = { inputs: undefined, outputs: undefined };
        nativeStartPositions.set(node, starts);
    }
    const key = isInput ? "inputs" : "outputs";
    if (starts[key] !== undefined) return starts[key];

    const slots = isInput ? inputSockets(node) : (node.outputs ?? []);
    const slot = slots[0];
    if (!slot || typeof node.getConnectionPos !== "function") return SLOT_START_Y;
    const index = (isInput ? node.inputs : node.outputs).indexOf(slot);
    const position = node.getConnectionPos(isInput, index);
    const start = position[1] - (node.pos?.[1] ?? 0) - SLOT_ROW_HEIGHT / 2;
    starts[key] = Math.max(SLOT_START_Y, start);
    return starts[key];
}

function rememberPositions(slots) {
    for (const slot of slots) {
        if (!originalPositions.has(slot)) originalPositions.set(slot, slot.pos ? [...slot.pos] : null);
    }
}

function restorePositions(slots) {
    for (const slot of slots) {
        if (!originalPositions.has(slot)) continue;
        const position = originalPositions.get(slot);
        slot.pos = position ? [...position] : undefined;
    }
}

function applyPortLayout(node) {
    const inputs = inputSockets(node);
    const outputs = node.outputs ?? [];
    rememberPositions([...(node.inputs ?? []), ...outputs]);
    const config = nodeConfig(node);
    if (!Array.isArray(config.sections) || !hasAssignedSection(node, config)) {
        restorePositions([...(node.inputs ?? []), ...outputs]);
        return createPortLayout(inputs, outputs, config);
    }

    const layout = createPortLayout(inputs, outputs, config, SLOT_ROW_HEIGHT, SECTION_HEADER_HEIGHT, {
        inputs: nativeStartY(node, true),
        outputs: nativeStartY(node, false),
    });
    for (let index = 0; index < inputs.length; index += 1) {
        inputs[index].pos = [10, layout.inputs.positions[index]];
    }
    for (let index = 0; index < outputs.length; index += 1) {
        outputs[index].pos = [Math.max(10, (node.size?.[0] ?? 180) - 10), layout.outputs.positions[index]];
    }
    const currentHeight = node.size?.[1] ?? 0;
    if (layout.height > currentHeight) node.setSize?.([node.size?.[0] ?? 180, layout.height]);
    return layout;
}

function drawSectionHeaders(node, ctx, layout) {
    ctx.save();
    ctx.font = "600 11px sans-serif";
    ctx.fillStyle = "#93c5aa";
    ctx.textBaseline = "middle";

    for (const header of layout.inputs.headers) {
        ctx.textAlign = "left";
        ctx.fillText(header.label, 16, header.y + SECTION_HEADER_HEIGHT / 2);
        ctx.strokeStyle = "rgba(147, 197, 170, 0.35)";
        ctx.beginPath();
        ctx.moveTo(16, header.y + SECTION_HEADER_HEIGHT - 1);
        ctx.lineTo(Math.max(28, (node.size?.[0] ?? 180) * 0.42), header.y + SECTION_HEADER_HEIGHT - 1);
        ctx.stroke();
    }

    for (const header of layout.outputs.headers) {
        ctx.textAlign = "right";
        ctx.fillText(header.label, Math.max(28, (node.size?.[0] ?? 180) - 16), header.y + SECTION_HEADER_HEIGHT / 2);
        ctx.strokeStyle = "rgba(147, 197, 170, 0.35)";
        ctx.beginPath();
        ctx.moveTo(Math.min((node.size?.[0] ?? 180) - 28, (node.size?.[0] ?? 180) * 0.58), header.y + SECTION_HEADER_HEIGHT - 1);
        ctx.lineTo((node.size?.[0] ?? 180) - 16, header.y + SECTION_HEADER_HEIGHT - 1);
        ctx.stroke();
    }
    ctx.restore();
}

function addStyle() {
    if (document.getElementById("utopik-subgraph-sections-style")) return;
    const style = document.createElement("style");
    style.id = "utopik-subgraph-sections-style";
    style.textContent = `
        .utopik-subgraph-sections-dialog { width:min(560px,calc(100vw - 32px)); max-height:80vh; overflow:auto; padding:16px;
            color:var(--input-text,#eee); background:var(--comfy-menu-bg,#222); border:1px solid var(--border-color,#666); border-radius:4px; }
        .utopik-subgraph-sections-dialog::backdrop { background:#0009; }
        .utopik-subgraph-sections-dialog h2 { margin:0 0 12px; font-size:16px; }
        .utopik-subgraph-sections-dialog h3 { margin:14px 0 6px; font-size:13px; }
        .utopik-subgraph-sections-dialog button, .utopik-subgraph-sections-dialog input, .utopik-subgraph-sections-dialog select {
            min-height:28px; color:inherit; background:var(--comfy-input-bg,#222); border:1px solid var(--border-color,#666); border-radius:3px; padding:4px 6px; }
        .utopik-subgraph-sections-list, .utopik-subgraph-port-list { display:grid; gap:6px; }
        .utopik-subgraph-section-row, .utopik-subgraph-port-row { display:grid; grid-template-columns:minmax(0,1fr) 150px auto; align-items:center; gap:6px; }
        .utopik-subgraph-port-row { grid-template-columns:minmax(0,1fr) 180px; }
        .utopik-subgraph-sections-actions { display:flex; justify-content:space-between; gap:8px; margin-top:14px; }
        .utopik-subgraph-sections-actions > span { display:flex; gap:8px; }
    `;
    document.head.append(style);
}

function element(tag, text, className = "") {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    if (className) result.className = className;
    return result;
}

function openSectionEditor(node) {
    addStyle();
    const dialog = element("dialog", undefined, "utopik-subgraph-sections-dialog");
    const config = nodeConfig(node);
    const sections = (config.sections ?? []).map(section => ({ ...section }));
    const assignments = {
        inputs: { ...(config.assignments?.inputs ?? {}) },
        outputs: { ...(config.assignments?.outputs ?? {}) },
    };
    dialog.append(element("h2", "Subgraph socket sections"));
    const sectionList = element("div", undefined, "utopik-subgraph-sections-list");
    dialog.append(sectionList);

    const inputList = element("div", undefined, "utopik-subgraph-port-list");
    const outputList = element("div", undefined, "utopik-subgraph-port-list");
    const renderPorts = () => {
        for (const [direction, ports, list] of [["inputs", inputSockets(node), inputList], ["outputs", node.outputs ?? [], outputList]]) {
            list.replaceChildren();
            for (const port of ports) {
                const row = element("label", undefined, "utopik-subgraph-port-row");
                row.append(element("span", port.label || port.name));
                const select = element("select");
                select.setAttribute("aria-label", `${direction === "inputs" ? "Input" : "Output"} ${port.name} section`);
                const ungrouped = element("option", "Ungrouped");
                ungrouped.value = "";
                select.append(ungrouped);
                for (const section of sections) {
                    const option = element("option", section.label || "Untitled section");
                    option.value = section.id;
                    select.append(option);
                }
                select.value = assignments[direction][port.name] ?? "";
                select.addEventListener("change", () => {
                    if (select.value) assignments[direction][port.name] = select.value;
                    else delete assignments[direction][port.name];
                });
                row.append(select);
                list.append(row);
            }
        }
    };

    const renderSections = () => {
        sectionList.replaceChildren();
        for (const section of sections) {
            const row = element("div", undefined, "utopik-subgraph-section-row");
            const name = element("input");
            name.value = section.label;
            name.setAttribute("aria-label", "Section title");
            name.addEventListener("input", () => { section.label = name.value; });
            const spacer = element("span");
            const remove = element("button", "Remove section");
            remove.type = "button";
            remove.addEventListener("click", () => {
                for (const direction of ["inputs", "outputs"]) {
                    for (const key of Object.keys(assignments[direction])) {
                        if (assignments[direction][key] === section.id) delete assignments[direction][key];
                    }
                }
                sections.splice(sections.indexOf(section), 1);
                renderSections();
                renderPorts();
            });
            row.append(name, spacer, remove);
            sectionList.append(row);
        }
    };

    dialog.append(element("h3", "Inputs"), inputList, element("h3", "Outputs"), outputList);
    const actions = element("div", undefined, "utopik-subgraph-sections-actions");
    const add = element("button", "Add section");
    add.type = "button";
    add.addEventListener("click", () => {
        sections.push({ id: `section-${Date.now()}-${sectionCounter++}`, label: "New section" });
        renderSections();
        renderPorts();
    });
    const buttons = element("span");
    const cancel = element("button", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => dialog.close());
    const save = element("button", "Save sections");
    save.type = "button";
    save.addEventListener("click", () => {
        node.properties ??= {};
        node.properties[PROPERTY_NAME] = {
            version: 1,
            sections: sections.filter(section => section.label.trim()).map(section => ({ id: section.id, label: section.label.trim() })),
            assignments,
        };
        dialog.close();
        node.graph?.change?.();
        node.graph?.setDirtyCanvas?.(true, true);
    });
    buttons.append(cancel, save);
    actions.append(add, buttons);
    dialog.append(actions);
    document.body.append(dialog);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    renderSections();
    renderPorts();
    dialog.showModal();
}

function installOnNode(node) {
    if (!node.isSubgraphNode?.() || node.utopikSocketSectionsInstalled) return;
    node.utopikSocketSectionsInstalled = true;

    const originalDraw = node.onDrawForeground;
    node.onDrawForeground = function (ctx, ...args) {
        originalDraw?.call(this, ctx, ...args);
        const layout = applyPortLayout(this);
        if (layout.inputs.headers.length || layout.outputs.headers.length) drawSectionHeaders(this, ctx, layout);
    };

    const originalArrange = node.arrange;
    if (originalArrange) {
        node.arrange = function (...args) {
            const result = originalArrange.apply(this, args);
            applyPortLayout(this);
            return result;
        };
    }

    const originalMenu = node.getExtraMenuOptions;
    node.getExtraMenuOptions = function (canvas, options) {
        const existing = originalMenu?.call(this, canvas, options);
        const menu = Array.isArray(existing) ? existing : (Array.isArray(options) ? options : []);
        menu.push({
            content: "Edit socket sections",
            callback: () => openSectionEditor(this),
        });
        return menu;
    };
    applyPortLayout(node);
}

export const extension = {
    name: "Utopik.SubgraphSections",
    nodeCreated: installOnNode,
};

app.registerExtension(extension);
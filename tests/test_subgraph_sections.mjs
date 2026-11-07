import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

function loadModule() {
    let registeredExtension;
    const source = readFileSync(new URL("../web/subgraph_sections.js", import.meta.url), "utf8");
    const code = source
        .replace(/^import .*;\r?\n/gm, "")
        .replace(/^export function /gm, "function ")
        .replace(/^export const /gm, "const ");
    const result = runInNewContext(`${code}\n;({ createPortLayout, extension });`, {
        app: { registerExtension(value) { registeredExtension = value; } },
        document: {},
    });
    assert.equal(result.extension, registeredExtension);
    return result;
}

test("groups input and output slots by section without changing their order or names", () => {
    const { createPortLayout } = loadModule();
    const inputs = [{ name: "model" }, { name: "shots" }, { name: "asset_bundle" }];
    const outputs = [{ name: "clips" }, { name: "assembled_video" }];
    const layout = createPortLayout(inputs, outputs, {
        sections: [
            { id: "generation", label: "Generation" },
            { id: "results", label: "Results" },
        ],
        assignments: {
            inputs: { model: "generation", asset_bundle: "generation" },
            outputs: { clips: "results", assembled_video: "results" },
        },
    });

    assert.deepEqual(inputs.map(port => port.name), ["model", "shots", "asset_bundle"]);
    assert.deepEqual(outputs.map(port => port.name), ["clips", "assembled_video"]);
    assert.ok(layout.inputs.positions[0] < layout.inputs.positions[2]);
    assert.ok(layout.inputs.positions[2] < layout.inputs.positions[1]);
    assert.ok(layout.outputs.positions[0] < layout.outputs.positions[1]);
    assert.deepEqual(Array.from(layout.inputs.headers, header => header.label), ["Generation"]);
    assert.deepEqual(Array.from(layout.outputs.headers, header => header.label), ["Results"]);
    assert.ok(layout.height > layout.inputs.positions[1]);
});

test("unassigned and stale ports remain visible without section headings", () => {
    const { createPortLayout } = loadModule();
    const layout = createPortLayout([{ name: "new_input" }], [{ name: "output" }], {
        sections: [{ id: "removed", label: "Removed group" }],
        assignments: { inputs: { old_input: "removed" }, outputs: {} },
    });

    assert.equal(layout.inputs.headers.length, 0);
    assert.equal(layout.outputs.headers.length, 0);
    assert.equal(layout.inputs.positions.length, 1);
    assert.equal(layout.outputs.positions.length, 1);
});

test("subgraph extension registers the node-created hook", () => {
    const { extension } = loadModule();
    assert.equal(typeof extension.nodeCreated, "function");
    assert.equal(extension.name, "Utopik.SubgraphSections");
});

test("empty sections and promoted widget inputs keep their native slot positions", () => {
    const { extension } = loadModule();
    const plainInput = { name: "data", pos: [10, 48] };
    const widgetInput = { name: "strength", widgetId: "widget-1", pos: [10, 88] };
    const output = { name: "result", pos: [190, 48] };
    const node = {
        inputs: [plainInput, widgetInput],
        outputs: [output],
        properties: {
            utopik_socket_sections: {
                sections: [{ id: "empty", label: "Empty" }],
                assignments: { inputs: {}, outputs: {} },
            },
        },
        size: [200, 120],
        isSubgraphNode: () => true,
        setSize() { throw new Error("empty sections must not resize the node"); },
    };

    extension.nodeCreated(node);

    assert.deepEqual(Array.from(plainInput.pos), [10, 48]);
    assert.deepEqual(Array.from(widgetInput.pos), [10, 88]);
    assert.deepEqual(Array.from(output.pos), [190, 48]);
    assert.equal(typeof node.getExtraMenuOptions, "function");
});

test("assigned sections move visual slots without renaming them", () => {
    const { extension } = loadModule();
    const input = { name: "model", link: 7 };
    const output = { name: "clip", links: [7] };
    const node = {
        inputs: [input],
        outputs: [output],
        properties: {
            utopik_socket_sections: {
                sections: [{ id: "generation", label: "Generation" }],
                assignments: { inputs: { model: "generation" }, outputs: { clip: "generation" } },
            },
        },
        pos: [0, 0],
        size: [200, 100],
        isSubgraphNode: () => true,
        getConnectionPos(isInput) { return [isInput ? 10 : 190, 54]; },
        setSize(size) { this.size = size; },
    };

    extension.nodeCreated(node);

    assert.deepEqual(input.name, "model");
    assert.equal(input.link, 7);
    assert.deepEqual(output.name, "clip");
    assert.deepEqual(Array.from(output.links), [7]);
    assert.equal(input.pos[1], 72);
    assert.equal(output.pos[1], 72);
});

test("edit action is added to subgraph menus without replacing existing entries", () => {
    const { extension } = loadModule();
    const node = {
        inputs: [],
        outputs: [],
        size: [200, 100],
        isSubgraphNode: () => true,
        getExtraMenuOptions(_canvas, options) {
            return [...options, { content: "Existing action" }];
        },
    };
    extension.nodeCreated(node);
    const menu = node.getExtraMenuOptions({}, []);

    assert.deepEqual(Array.from(menu, item => item.content), ["Existing action", "Edit socket sections"]);
    assert.equal(typeof menu.at(-1).callback, "function");

    const regularNode = { getExtraMenuOptions: () => [{ content: "Existing action" }] };
    extension.nodeCreated(regularNode);
    assert.equal(regularNode.getExtraMenuOptions()[0].content, "Existing action");
});
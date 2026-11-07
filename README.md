# ComfyUI Subgraph Sections

An experimental frontend extension for grouping the linkable inputs and outputs
of any ComfyUI subgraph instance under labeled headings on the parent node.
Create subgraphs normally from the selection/action menu; section assignments
are configured separately for each subgraph instance.

## Use

1. Restart ComfyUI and refresh the browser after installing this folder under
   `custom_nodes`.
2. Create or select a subgraph instance on the canvas and open its context menu.
3. Choose **Edit socket sections**, add section titles, and assign inputs and
   outputs to them. Ports left unassigned remain in an ungrouped area.
4. Save the workflow to retain that instance's section assignments.

The section editor groups linkable data sockets. Promoted widget controls remain
in their normal position. Port names, indices, and graph links are not changed;
section assignments are stored in the subgraph instance's `properties`.
Newly exposed ports start ungrouped.

## Compatibility

This add-on targets the installed ComfyUI frontend package 1.55.18. It uses
LiteGraph's per-slot position and node drawing/context-menu hooks, so frontend
updates may require adjustments. Check the node visually and verify its links
after changing the ComfyUI frontend version.
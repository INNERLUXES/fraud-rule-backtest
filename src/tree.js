// Walks a tree without calling itself: the nodes are visited in an order where every node comes after its children, and a
// function combines a node with the results of its children. Used for conditions, which nest.

// fold(root, childrenOf, combine): childrenOf(node) is the list of the children of a node; combine(node, results) gets the results of
// the children in order and returns the result of the node. Returns the result of the root.
export function fold(root, childrenOf, combine) {
  const order = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    order.push(node);
    for (const child of childrenOf(node)) stack.push(child);
  }
  const results = new Map();
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const node = order[i];
    results.set(node, combine(node, childrenOf(node).map((c) => results.get(c))));
  }
  return results.get(root);
}

// Every node of the tree, parents before children, in the order of the text.
export function nodesOf(root, childrenOf) {
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    out.push(node);
    const kids = childrenOf(node);
    for (let i = kids.length - 1; i >= 0; i -= 1) stack.push(kids[i]);
  }
  return out;
}

// The depth of the tree: 1 for a single node.
export function depthOf(root, childrenOf) {
  let best = 0;
  const stack = [[root, 1]];
  while (stack.length > 0) {
    const [node, d] = stack.pop();
    if (d > best) best = d;
    for (const child of childrenOf(node)) stack.push([child, d + 1]);
  }
  return best;
}

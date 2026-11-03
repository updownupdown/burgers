/**
 * Update a rendered card to new HTML in place: elements that are still there keep their identity,
 * so a card that redraws on every tap (Prep) doesn't replay its entrance animation, lose its
 * scroll position or drop focus. Children are matched by position and tag; anything that differs
 * is swapped. Small and dumb on purpose: the screens are a few hundred nodes.
 */
export function morph(from: Element, to: Element): void {
  syncAttrs(from, to);
  // Live form state the attributes don't carry (a range thumb the player just let go of).
  if (from instanceof HTMLInputElement && to instanceof HTMLInputElement && from.value !== to.value) from.value = to.value;
  morphChildren(from, to);
}

function syncAttrs(from: Element, to: Element): void {
  for (const a of [...from.attributes]) if (!to.hasAttribute(a.name)) from.removeAttribute(a.name);
  for (const a of [...to.attributes]) if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
}

function morphChildren(from: Node, to: Node): void {
  const olds = [...from.childNodes];
  const news = [...to.childNodes];
  news.forEach((n, i) => {
    const o = olds[i];
    if (!o) from.appendChild(n);
    else if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) from.replaceChild(n, o);
    else if (o.nodeType === Node.ELEMENT_NODE) morph(o as Element, n as Element);
    else if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue;
  });
  for (let i = news.length; i < olds.length; i++) olds[i].remove();
}

/** Parse one element's HTML (with its SVG) without putting it anywhere. */
export function parseOne(html: string): Element | null {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

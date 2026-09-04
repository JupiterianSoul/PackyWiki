// @ts-check
/**
 * BUILDING DOM
 * ============================================================================
 * One call per element, instead of five lines of createElement, className,
 * textContent, setAttribute and append. New screens are written with this;
 * the older ones still build by hand and are moved over as they are touched.
 *
 *   h('button.btn.btn-primary', { type: 'button', onClick: buy }, t('shopBuy'))
 *   h('div.row', [h('b', name), h('span.dim', note)])
 *
 * The tag string takes a tag, an #id and any number of .classes. Props map to
 * attributes, except: `class` and `className` add classes, `dataset` sets
 * data-*, `style` takes an object of properties, `on<Event>` listens, `hidden`
 * and `disabled` set the property, `html` sets innerHTML (for SVG icons only,
 * never for text a player wrote) and `ref` receives the node. Children may be
 * nodes, strings, numbers, arrays, or null and false, which are skipped.
 */

const SVG = 'http://www.w3.org/2000/svg';

export function h(tag, props, ...children) {
  if (props instanceof Node || typeof props === 'string' || typeof props === 'number' || Array.isArray(props)) {
    children.unshift(props);
    props = null;
  }
  const [name, ...marks] = String(tag).split(/(?=[#.])/);
  const svg = ['svg', 'path', 'circle', 'g', 'rect', 'line', 'polyline', 'polygon', 'text', 'use'].includes(name);
  const node = svg ? document.createElementNS(SVG, name) : document.createElement(name || 'div');
  for (const mark of marks) {
    if (mark[0] === '#') node.id = mark.slice(1);
    else node.classList.add(mark.slice(1));
  }
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class' || key === 'className') node.classList.add(...String(value).split(/\s+/).filter(Boolean));
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key === 'style') Object.assign(node.style, value);
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'ref') value(node);
      else if (key === 'hidden' || key === 'disabled' || key === 'checked' || key === 'value') node[key] = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
  }
  append(node, children);
  return node;
}

/** Appends children of any of the accepted shapes. */
export function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

/** Replaces the node's children with the given ones. */
export function fill(node, ...children) {
  node.replaceChildren();
  return append(node, children);
}

/**
 * Keeps a popout window's document looking like the page that opened it: a copy of each of the
 * page's stylesheets (`<link rel="stylesheet">` and `<style>`), in the page's order, and the theme
 * and language its `<html>` and `<body>` carry (their `class`, `lang`, `dir` and `data-*`
 * attributes, and the CSS custom properties of their inline style). `MutationObserver`s on the
 * page bring in the styles added, changed or removed after the window opened, and every change of
 * that theme. Internal to HorizonLayout, which mirrors each popout it opens and stops when the
 * popout closes.
 * @module
 */

const STYLE_SELECTOR = 'link[rel~="stylesheet"], style';

type StyleElement = HTMLLinkElement | HTMLStyleElement;

// What changes a stylesheet: its text, its attributes, its children.
const STYLE_CHANGES: MutationObserverInit = {
	subtree: true,
	childList: true,
	characterData: true,
	attributes: true
};

/**
 * Mirrors the styles of `source`, and the theme and language of its `<html>` and `<body>`, into
 * `target` now, and on every later change, until the returned function is called. The rest of the
 * page's state stays in the page: the other inline styles of `<body>` (a modal's
 * `pointer-events: none` or scroll lock) would freeze the window. Styles set only through the
 * CSSOM (`insertRule`, `adoptedStyleSheets`) leave no trace in the DOM and are not copied.
 */
export function mirrorPage(source: Document, target: Document): () => void {
	const clones = new Map<StyleElement, StyleElement>();

	// What can change a style or the theme is observed, not every change of the page, whose
	// attributes and text change all the time (a resize rewrites pane sizes on every pointer
	// move): the head; the nodes added to or removed from the page, anywhere; each stylesheet and
	// link outside the head (a link may become a stylesheet); and the attributes of <html> and
	// <body>, the body being observed again when it is replaced.
	let observedBody: HTMLElement | null = null;
	const styleObserver = new MutationObserver((records) => {
		if (source.body !== observedBody) observeBody();
		if (records.some(touchesStyles)) syncStyles();
	});
	const themeObserver = new MutationObserver(syncTheme);

	function syncStyles() {
		const styles = [...source.querySelectorAll<StyleElement>(STYLE_SELECTOR)];
		const kept = new Set(styles);
		for (const [style, clone] of clones) {
			if (kept.has(style)) continue;
			clone.remove();
			clones.delete(style);
		}
		// Each copy right after the one before, at the start of the head: a copy is moved only
		// when it is out of place, as moving a stylesheet link makes the window load it again.
		let previous: Node | null = null;
		for (const style of styles) {
			let clone = clones.get(style);
			if (clone) {
				updateCopy(style, clone);
			} else {
				clone = copyOf(style);
				clones.set(style, clone);
			}
			const next: Node | null = previous ? previous.nextSibling : target.head.firstChild;
			if (clone !== next) target.head.insertBefore(clone, next);
			previous = clone;
		}
		// Observing a node again only replaces its options.
		for (const element of source.querySelectorAll('link, style')) {
			if (!source.head.contains(element)) styleObserver.observe(element, STYLE_CHANGES);
		}
	}

	function syncTheme() {
		copyTheme(source.documentElement, target.documentElement);
		if (source.body) copyTheme(source.body, target.body);
	}

	function observeBody() {
		observedBody = source.body;
		if (observedBody) themeObserver.observe(observedBody, { attributes: true });
		syncTheme();
	}

	syncStyles();
	styleObserver.observe(source.head, STYLE_CHANGES);
	styleObserver.observe(source.documentElement, { childList: true, subtree: true });
	themeObserver.observe(source.documentElement, { attributes: true });
	observeBody();
	return () => {
		styleObserver.disconnect();
		themeObserver.disconnect();
	};
}

function copyOf(style: StyleElement): StyleElement {
	const clone = style.cloneNode(true) as StyleElement;
	// The window's own URL is about:blank: a relative href would resolve against nothing.
	if (style instanceof HTMLLinkElement) (clone as HTMLLinkElement).href = style.href;
	return clone;
}

function updateCopy(style: StyleElement, clone: StyleElement) {
	copyAttributes(style, clone);
	if (style instanceof HTMLLinkElement) {
		if ((clone as HTMLLinkElement).href !== style.href)
			(clone as HTMLLinkElement).href = style.href;
	} else if (clone.textContent !== style.textContent) {
		clone.textContent = style.textContent;
	}
}

// Sets every attribute of a stylesheet `from` on its copy `to`, and removes the others; a link's
// href is set apart, resolved.
function copyAttributes(from: Element, to: Element) {
	const isLink = from instanceof HTMLLinkElement;
	for (const { name, value } of from.attributes) {
		if (isLink && name === 'href') continue;
		if (to.getAttribute(name) !== value) to.setAttribute(name, value);
	}
	for (const name of to.getAttributeNames()) {
		if (!from.hasAttribute(name)) to.removeAttribute(name);
	}
}

// The attributes of `<html>` and `<body>` that carry a theme or the language.
function isThemeAttribute(name: string): boolean {
	return name === 'class' || name === 'lang' || name === 'dir' || name.startsWith('data-');
}

// Sets the theme attributes and the inline custom properties of `from` on `to`, and removes those
// `from` no longer has.
function copyTheme(from: HTMLElement, to: HTMLElement) {
	for (const { name, value } of from.attributes) {
		if (isThemeAttribute(name) && to.getAttribute(name) !== value) to.setAttribute(name, value);
	}
	for (const name of to.getAttributeNames()) {
		if (isThemeAttribute(name) && !from.hasAttribute(name)) to.removeAttribute(name);
	}
	const properties = customProperties(from.style);
	for (const name of customProperties(to.style).keys()) {
		if (!properties.has(name)) to.style.removeProperty(name);
	}
	for (const [name, { value, priority }] of properties) {
		if (
			to.style.getPropertyValue(name) !== value ||
			to.style.getPropertyPriority(name) !== priority
		) {
			to.style.setProperty(name, value, priority);
		}
	}
}

function customProperties(
	style: CSSStyleDeclaration
): Map<string, { value: string; priority: string }> {
	const properties = new Map<string, { value: string; priority: string }>();
	for (const name of style) {
		if (!name.startsWith('--')) continue;
		properties.set(name, {
			value: style.getPropertyValue(name),
			priority: style.getPropertyPriority(name)
		});
	}
	return properties;
}

// Whether `record` adds, removes or changes a stylesheet, or a link that may become one: the text
// of a `<style>`, an attribute of a link or a style (href, rel, media, `disabled`), or a node
// holding one. Any link counts, so the sync puts a new one under observation and a stylesheet
// whose rel changes is dropped.
function touchesStyles(record: MutationRecord): boolean {
	const target = record.target instanceof Element ? record.target : record.target.parentElement;
	if (target instanceof HTMLLinkElement || target?.closest('style')) return true;
	if (record.type !== 'childList') return false;
	return [...record.addedNodes, ...record.removedNodes].some(
		(node) =>
			node instanceof Element &&
			(node.matches('link, style') || !!node.querySelector('link, style'))
	);
}

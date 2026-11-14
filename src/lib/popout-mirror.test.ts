/**
 * Unit tests of `mirrorPage` (popout-mirror.ts), between two jsdom documents: the styles and the
 * theme of `<html>` and `<body>` copied when a popout opens, then followed as they change, until
 * the mirroring stops.
 * @module
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mirrorPage } from './popout-mirror.ts';

/** Lets the pending mutation records reach their observer. */
function settle() {
	return new Promise((resolve) => setTimeout(resolve));
}

function addStyle(source: Document, css: string, before?: Element): HTMLStyleElement {
	const style = source.createElement('style');
	style.textContent = css;
	source.head.insertBefore(style, before ?? null);
	return style;
}

/** The text of each `<style>` copied into `target`, in its order. */
function stylesOf(target: Document): (string | null)[] {
	return [...target.head.querySelectorAll('style')].map((style) => style.textContent);
}

const stops: (() => void)[] = [];

/** Two documents, `target` mirroring `source`. */
function mirrored() {
	const source = document.implementation.createHTMLDocument('page');
	const target = document.implementation.createHTMLDocument('');
	stops.push(mirrorPage(source, target));
	return { source, target, stop: stops.at(-1)! };
}

afterEach(() => {
	for (const stop of stops.splice(0)) stop();
});

describe('mirrorPage', () => {
	it('copies the styles and the html and body attributes there are when it starts', () => {
		const source = document.implementation.createHTMLDocument('page');
		addStyle(source, '.a { color: red }');
		const link = source.createElement('link');
		link.rel = 'stylesheet';
		link.setAttribute('href', 'https://example.test/theme.css');
		source.head.append(link);
		source.documentElement.className = 'dark';
		source.documentElement.lang = 'fr';
		source.body.dataset['theme'] = 'nord';
		const target = document.implementation.createHTMLDocument('');

		stops.push(mirrorPage(source, target));

		expect(stylesOf(target)).toEqual(['.a { color: red }']);
		expect(target.head.querySelector('link')?.href).toBe('https://example.test/theme.css');
		expect(target.documentElement.className).toBe('dark');
		expect(target.documentElement.lang).toBe('fr');
		expect(target.body.dataset['theme']).toBe('nord');
	});

	it('follows the styles added, changed and removed later, in the page order', async () => {
		const { source, target } = mirrored();
		const first = addStyle(source, '.first {}');
		await settle();
		expect(stylesOf(target)).toEqual(['.first {}']);

		addStyle(source, '.before {}', first);
		first.textContent = '.first { color: blue }';
		await settle();
		expect(stylesOf(target)).toEqual(['.before {}', '.first { color: blue }']);

		first.remove();
		await settle();
		expect(stylesOf(target)).toEqual(['.before {}']);
	});

	it('follows a style in the body, added, changed and removed', async () => {
		const { source, target } = mirrored();
		const panel = source.createElement('div');
		source.body.append(panel);
		const style = source.createElement('style');
		style.textContent = '.in-body {}';
		panel.append(style);
		await settle();
		expect(stylesOf(target)).toEqual(['.in-body {}']);

		style.firstChild!.nodeValue = '.in-body { color: green }';
		await settle();
		expect(stylesOf(target)).toEqual(['.in-body { color: green }']);

		panel.remove();
		await settle();
		expect(stylesOf(target)).toEqual([]);
	});

	it('follows a style moved from the head to the body, then changed', async () => {
		const { source, target } = mirrored();
		const style = addStyle(source, '.moved {}');
		await settle();
		source.body.append(style);
		await settle();

		style.firstChild!.nodeValue = '.moved { color: red }';
		style.media = 'print';
		await settle();
		expect(stylesOf(target)).toEqual(['.moved { color: red }']);
		expect(target.head.querySelector('style')!.media).toBe('print');
	});

	it('follows a link outside the head that becomes a stylesheet, on its own', async () => {
		const { source, target } = mirrored();
		const panel = source.createElement('div');
		const link = source.createElement('link');
		link.rel = 'preload';
		link.setAttribute('href', 'https://example.test/late.css');
		panel.append(link);
		source.body.append(panel);
		await settle();
		expect(target.head.querySelector('link')).toBeNull();

		link.rel = 'stylesheet';
		await settle();
		expect(target.head.querySelector('link')?.href).toBe('https://example.test/late.css');
	});

	it('follows a style put in html itself', async () => {
		const { source, target } = mirrored();
		const style = source.createElement('style');
		style.textContent = '.in-html {}';
		source.documentElement.append(style);
		await settle();
		expect(stylesOf(target)).toEqual(['.in-html {}']);
	});

	it('follows a body that replaces the body', async () => {
		const { source, target } = mirrored();
		const body = source.createElement('body');
		body.className = 'light';
		const style = source.createElement('style');
		style.textContent = '.new-body {}';
		body.append(style);
		source.documentElement.replaceChild(body, source.body);
		await settle();
		expect(target.body.className).toBe('light');
		expect(stylesOf(target)).toEqual(['.new-body {}']);

		body.classList.replace('light', 'dark');
		await settle();
		expect(target.body.className).toBe('dark');
	});

	it('follows a change of a stylesheet link', async () => {
		const { source, target } = mirrored();
		const link = source.createElement('link');
		link.rel = 'stylesheet';
		link.setAttribute('href', 'https://example.test/light.css');
		source.head.append(link);
		await settle();

		link.setAttribute('href', 'https://example.test/dark.css');
		link.media = 'screen';
		await settle();
		const copy = target.head.querySelector('link')!;
		expect(copy.href).toBe('https://example.test/dark.css');
		expect(copy.media).toBe('screen');

		link.rel = 'preload';
		await settle();
		expect(target.head.querySelector('link')).toBeNull();
	});

	it('follows the theme set on html or body, attributes removed included', async () => {
		const { source, target } = mirrored();

		source.documentElement.classList.add('light');
		source.body.setAttribute('data-theme', 'nord');
		source.documentElement.style.setProperty('--hl-primary', 'blue');
		await settle();
		expect(target.documentElement.className).toBe('light');
		expect(target.body.getAttribute('data-theme')).toBe('nord');
		expect(target.documentElement.style.getPropertyValue('--hl-primary')).toBe('blue');

		source.documentElement.classList.remove('light');
		source.body.removeAttribute('data-theme');
		await settle();
		expect(target.documentElement.className).toBe('');
		expect(target.body.hasAttribute('data-theme')).toBe(false);
	});

	it('leaves the rest of the page state out: a modal’s inline styles on the body', async () => {
		const { source, target } = mirrored();

		source.body.style.pointerEvents = 'none';
		source.body.style.overflow = 'hidden';
		source.body.style.setProperty('--hl-card', 'navy');
		source.body.setAttribute('aria-hidden', 'true');
		await settle();
		expect(target.body.style.pointerEvents).toBe('');
		expect(target.body.style.overflow).toBe('');
		expect(target.body.style.getPropertyValue('--hl-card')).toBe('navy');
		source.body.style.setProperty('--hl-card', 'teal', 'important');
		await settle();
		expect(target.body.style.getPropertyValue('--hl-card')).toBe('teal');
		expect(target.body.style.getPropertyPriority('--hl-card')).toBe('important');
		expect(target.body.hasAttribute('aria-hidden')).toBe(false);

		target.body.style.color = 'red';
		source.body.style.removeProperty('--hl-card');
		await settle();
		expect(target.body.style.getPropertyValue('--hl-card')).toBe('');
		expect(target.body.style.color).toBe('red');
	});

	it('ignores the page changes that touch no style', async () => {
		const { source, target } = mirrored();
		addStyle(source, '.a {}');
		await settle();
		const copy = target.head.querySelector('style');

		const panel = source.createElement('div');
		panel.className = 'panel';
		source.body.append(panel);
		panel.textContent = 'text';
		await settle();
		expect(target.head.querySelector('style')).toBe(copy);
		expect(target.body.childElementCount).toBe(0);
	});

	it('stops following once stopped', async () => {
		const { source, target, stop } = mirrored();
		stop();

		addStyle(source, '.late {}');
		source.documentElement.className = 'light';
		await settle();
		expect(stylesOf(target)).toEqual([]);
		expect(target.documentElement.className).toBe('');
	});
});

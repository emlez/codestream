"use strict";
import { debounce as _debounce } from "lodash-es";
import uuidv4 from "uuid/v4";

export interface IDeferrable {
	cancel(): void;
	flush(...args: any[]): void;
	pending?(): boolean;
}

interface IPropOfValue {
	(): any;
	value: string | undefined;
}

export namespace Functions {
	export function cachedOnce<T>(
		fn: (...args: any[]) => Promise<T>,
		seed: T
	): (...args: any[]) => Promise<T> {
		let cached: T | undefined = seed;
		return (...args: any[]) => {
			if (cached !== undefined) {
				const promise = Promise.resolve(cached);
				cached = undefined;

				return promise;
			}
			return fn(...args);
		};
	}

	export function debounce<T extends (...args: any[]) => any>(
		fn: T,
		wait?: number,
		options?: { leading?: boolean; maxWait?: number; track?: boolean; trailing?: boolean }
	): T & IDeferrable {
		const { track, ...opts } = { track: false, ...(options || {}) } as {
			leading?: boolean;
			maxWait?: number;
			track?: boolean;
			trailing?: boolean;
		};

		if (track !== true) return _debounce(fn, wait, opts);

		let pending = false;

		const debounced = _debounce(
			(function(this: any, ...args: any[]) {
				pending = false;
				return fn.apply(this, args);
			} as any) as T,
			wait,
			options
		) as T & IDeferrable;

		const tracked = (function(this: any, ...args: any[]) {
			pending = true;
			return debounced.apply(this, args);
		} as any) as T & IDeferrable;

		tracked.pending = function() {
			return pending;
		};
		tracked.cancel = function() {
			return debounced.cancel.apply(debounced);
		};
		tracked.flush = function(...args: any[]) {
			return debounced.flush.apply(debounced, args);
		};

		return tracked;
	}

	export function debounceMerge<T extends (...args: any[]) => any>(
		fn: T,
		merger: (merged: any | undefined, current: any) => any,
		wait?: number,
		options?: { leading?: boolean; maxWait?: number; trailing?: boolean }
	): T {
		let merged: any | undefined;
		let context: any;

		const debounced = debounce<T>(
			function() {
				if (!Array.isArray(merged)) {
					return fn.apply(context, [merged]);
				}

				const args = merged;
				merged = undefined;

				for (const arg of args) {
					fn.apply(context, [arg]);
				}
			} as any,
			wait,
			options
		);

		return function(this: any, current: any) {
			context = this;
			merged = merger.apply(context, [merged, current]);
			return debounced();
		} as any;
	}

	// interface Data {
	//     type: 'foo' | 'bar';
	//     values: string[];
	// }

	// const foo = (data: Data) => console.log(data);
	// const foodb = debounceMerge(foo, (combined: Data[] | undefined, current: Data) => {
	//     if (combined === undefined) return [current];

	//     const found = combined.find(_ => _.type === current.type);
	//     if (found === undefined) {
	//         combined.push(current);
	//     }
	//     else {
	//         found.values.push(...current.values);
	//     }
	//     return combined;
	// }, 1000);

	// foodb({ type: 'foo', values: ['foo'] });
	// foodb({ type: 'foo', values: ['bar'] });
	// foodb({ type: 'bar', values: ['1', '2', '3'] });
	// foodb({ type: 'foo', values: ['baz'] });

	// setTimeout(() => {
	//     foodb({ type: 'foo', values: ['baz'] });
	// }, 2000);

	// setTimeout(() => {
	//     foodb({ type: 'foo', values: ['4'] });
	//     foodb({ type: 'bar', values: ['5', '6'] });
	//     foodb({ type: 'bar', values: ['7'] });
	// }, 5000);

	const comma = ",";
	const empty = "";
	const equals = "=";
	const openBrace = "{";
	const openParen = "(";
	const closeParen = ")";

	const fnBodyRegex = /\(([\s\S]*)\)/;
	const fnBodyStripCommentsRegex = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/gm;
	const fnBodyStripParamDefaultValueRegex = /\s?=.*$/;

	export function getParameters(fn: Function): string[] {
		if (typeof fn !== "function") throw new Error("Not supported");

		if (fn.length === 0) return [];

		let fnBody: string = Function.prototype.toString.call(fn);
		fnBody = fnBody.replace(fnBodyStripCommentsRegex, empty) || fnBody;
		fnBody = fnBody.slice(0, fnBody.indexOf(openBrace));

		let open = fnBody.indexOf(openParen);
		let close = fnBody.indexOf(closeParen);

		open = open >= 0 ? open + 1 : 0;
		close = close > 0 ? close : fnBody.indexOf(equals);

		fnBody = fnBody.slice(open, close);
		fnBody = `(${fnBody})`;

		const match = fnBody.match(fnBodyRegex);
		return match != null
			? match[1]
					.split(comma)
					.map(param => param.trim().replace(fnBodyStripParamDefaultValueRegex, empty))
			: [];
	}

	export function isPromise(o: any) {
		return (typeof o === "object" || typeof o === "function") && typeof o.then === "function";
	}

	export function propOf<T, K extends Extract<keyof T, string>>(o: T, key: K) {
		const propOfCore = <T, K extends Extract<keyof T, string>>(o: T, key: K) => {
			const value: string =
				(propOfCore as IPropOfValue).value === undefined
					? key
					: `${(propOfCore as IPropOfValue).value}.${key}`;
			(propOfCore as IPropOfValue).value = value;
			const fn = <Y extends Extract<keyof T[K], string>>(k: Y) => propOfCore(o[key], k);
			return Object.assign(fn, { value: value });
		};
		return propOfCore(o, key);
	}

	export async function wait(ms: number) {
		await new Promise(resolve => setTimeout(resolve, ms));
	}

	export async function waitUntil(
		fn: (...args: any[]) => boolean,
		timeout: number
	): Promise<boolean> {
		const max = Math.round(timeout / 100);
		let counter = 0;
		while (true) {
			if (fn()) return true;
			if (counter > max) return false;

			await wait(100);
			counter++;
		}
	}

	export function uuid() {
		return uuidv4();
	}

	export function shortUuid() {
		const data = new Uint8Array(16);
		uuidv4(null, data, 0);

		const base64 = Buffer.from(
			data.buffer as ArrayBuffer,
			data.byteOffset,
			data.byteLength
		).toString("base64");
		return base64
			.replace(/\+/g, "-") // Replace + with - (see RFC 4648, sec. 5)
			.replace(/\//g, "_") // Replace / with _ (see RFC 4648, sec. 5)
			.substring(0, 22); // Drop '==' padding;
	}
}

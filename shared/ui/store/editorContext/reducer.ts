import { State, EditorContextActionsType } from "./types";
import { Range } from "vscode-languageserver-types";
import * as actions from "./actions";
import { ActionType } from "../common";
import { createSelector } from "reselect";
import { range } from "@codestream/webview/utils";
import { EditorMetrics, EditorScrollMode } from "@codestream/protocols/webview";
import { GetFileScmInfoResponse, GetRangeScmInfoResponse } from "@codestream/protocols/agent";

type EditorContextActions = ActionType<typeof actions>;

const initialState: State = {
	activeFile: "",
	textEditorVisibleRanges: [],
	textEditorUri: undefined,
	textEditorSelections: [],
	metrics: {
		fontSize: 12,
		lineHeight: 18,
		scrollMode: EditorScrollMode.Lines,
		scrollRatio: 1
	},
	scmInfo: undefined
};

export function reduceEditorContext(state = initialState, action: EditorContextActions) {
	switch (action.type) {
		case EditorContextActionsType.SetEditorContext: {
			const { metrics }: { metrics?: EditorMetrics } = action.payload;
			if (metrics != null) {
				if (metrics.lineHeight === undefined) {
					if (metrics.fontSize === undefined) {
						metrics.fontSize = 12;
						metrics.lineHeight = 18;
					} else {
						metrics.lineHeight = metrics.fontSize * 1.5;
					}
				}

				if (metrics.scrollMode === undefined) {
					metrics.scrollMode = EditorScrollMode.Lines;
				}

				if (metrics.scrollRatio === undefined) {
					metrics.scrollRatio = 1;
				}
			}

			return { ...state, ...action.payload };
		}
		case "RESET":
			return initialState;
		default:
			return state;
	}
}

const emptyArray = [];

export const getCurrentSelection = createSelector(
	(state: State) => state.textEditorSelections || emptyArray,
	selections => selections[0]
);

export const getVisibleRanges = (state: State) => state.textEditorVisibleRanges || emptyArray;

// alias for mapVisibleRangeToLine0
export const getLine0ForEditorLine = createSelector(
	(visibleRanges?: Range[]) => visibleRanges || emptyArray,
	(_: any, editorLine: number) => editorLine,
	(textEditorVisibleRanges: Range[], editorLine: number) => {
		let lineCounter = 0;
		let toLineNum0 = -1; // -1 indicates we didn't find it
		if (textEditorVisibleRanges != null) {
			textEditorVisibleRanges.forEach(lineRange => {
				range(lineRange.start.line, lineRange.end.line + 1).forEach(thisLine => {
					if (thisLine === editorLine) toLineNum0 = lineCounter;
					lineCounter++;
				});
			});
		}
		return toLineNum0;
	}
);

export const getVisibleLineCount = createSelector(
	(visibleRanges?: Range[]) => visibleRanges || emptyArray,
	(textEditorVisibleRanges: Range[]) => {
		let numLinesVisible = 0;
		if (textEditorVisibleRanges != null) {
			textEditorVisibleRanges.forEach(range => {
				numLinesVisible += range.end.line - range.start.line + 1;
			});
		}
		return numLinesVisible;
	}
);

export enum ScmError {
	NoRepo = "NoRepo",
	NoGit = "NoGit",
	NoRemotes = "NoRemotes"
}

export const getFileScmError = (scmInfo: GetFileScmInfoResponse | GetRangeScmInfoResponse) => {
	if (!scmInfo.scm) {
		if (!scmInfo.error) {
			return ScmError.NoRepo;
		} else {
			return ScmError.NoGit;
		}
	} else if (scmInfo.scm!.remotes.length === 0) {
		return ScmError.NoRemotes;
	}
	return undefined;
};

import { WebviewContext, WebviewPanels } from "@codestream/protocols/webview";
import { AnyObject } from "@codestream/webview/utils";

export enum ContextActionsType {
	SetCodemarkFileFilter = "@context/SetCodemarkFileFilter",
	SetCodemarkTypeFilter = "@context/SetCodemarkTypeFilter",
	SetCodemarkTagFilter = "@context/SetCodemarkTagFilter",
	SetCodemarkBranchFilter = "@context/SetCodemarkBranchFilter",
	SetCodemarkAuthorFilter = "@context/SetCodemarkAuthorFilter",
	SetChannelFilter = "@context/SetChannelFilter",
	SetContext = "@context/Set",
	OpenPanel = "@context/OpenPanel",
	ClosePanel = "@context/ClosePanel",
	SetFocusState = "@context/SetFocusState",
	SetCurrentStream = "@context/SetCurrentStream",
	SetIssueProvider = "@context/SetIssueProvider",
	SetCodemarksFileViewStyle = "@context/SetCodemarksFileViewStyle",
	SetCodemarksShowArchived = "@context/SetCodemarksShowArchived",
	SetCodemarksShowResolved = "@context/SetCodemarksShowResolved",
	SetChannelsMuteAll = "@context/SetChannelsMuteAll",
	SetShowFeedbackSmiley = "@context/SetShowFeedbackSmiley",
	SetNewPostEntryPoint = "@context/SetNewPostEntryPoint",
	SetRoute = "@context/SetRoute",
	SetChatProviderAccess = "@context/SetChatProviderAccess",
	SetCurrentCodemark = "@context/SetCurrentCodemark",
	SetSpatialViewPRCommentsToggle = "@context/SetSpatialViewPRCommentsToggle",
	RepositionCodemark = "@context/RepositionCodemark",
	SetCurrentReview = "@context/SetCurrentReview",
	SetActiveReview = "@context/SetActiveReview",
	SetQuery = "@context/SetQuery"
}

export type PostEntryPoint = "Stream" | "Global Nav" | "Spatial View" | undefined;

export interface ContextState extends WebviewContext {
	channelFilter: string;
	channelsMuteAll: boolean;

	codemarkFileFilter: string; // TODO: specify types
	codemarkTypeFilter: string;
	codemarkTagFilter: string;
	codemarkBranchFilter: string;
	codemarkAuthorFilter: string;

	codemarksFileViewStyle: "list" | "inline";
	codemarksShowArchived: boolean;
	codemarksShowResolved: boolean;

	spatialViewShowPRComments: boolean;

	issueProvider?: string;
	shareTargetTeamId?: string;
	panelStack: (WebviewPanels | string)[];

	showFeedbackSmiley: boolean;

	newPostEntryPoint: PostEntryPoint;
	route: RouteState;

	chatProviderAccess: ChatProviderAccess;

	query: string;
}

export type ChatProviderAccess = "strict" | "permissive";

export enum Route {
	NewUser = "newUserEntry",
	Signup = "signup",
	Login = "login",
	SlackAuth = "slackAuth",
	MSTeamsAuth = "msTeamsAuth",
	JoinTeam = "joinTeam",
	EmailConfirmation = "emailConfirmation",
	TeamCreation = "teamCreation",
	ForgotPassword = "forgotPassword",
	MSTeamsAdminApprovalInfo = "MSTeamsAdminApprovalInfo",
	MustSetPassword = "MustSetPassword"
}

export interface RouteState {
	name: Route;
	params: AnyObject;
}

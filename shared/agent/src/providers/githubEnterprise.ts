"use strict";
import { GitRemoteLike } from "git/gitService";
import { GraphQLClient } from "graphql-request";
import semver from "semver";
import { URI } from "vscode-uri";
import { Container } from "../container";
import { Logger } from "../logger";
import { DidChangePullRequestCommentsNotificationType } from "../protocol/agent.protocol";
import { ProviderConfigurationData } from "../protocol/agent.protocol.providers";
import { log, lspProvider } from "../system";
import { GitHubProvider } from "./github";
import { ProviderGetRepoInfoResponse, ProviderPullRequestInfo, ProviderVersion } from "./provider";

/**
 * GitHub Enterprise
 * minimum supported version is 2.19.6 https://enterprise.github.com/releases/2.19.6/notes
 */
@lspProvider("github_enterprise")
export class GitHubEnterpriseProvider extends GitHubProvider {
	private static ApiVersionString = "v3";

	get displayName() {
		return "GitHub Enterprise";
	}

	get name() {
		return "github_enterprise";
	}

	get apiPath() {
		return this.providerConfig.forEnterprise || this.providerConfig.isEnterprise
			? `/api/${GitHubEnterpriseProvider.ApiVersionString}`
			: "";
	}

	get baseUrl() {
		const { host, apiHost, isEnterprise, forEnterprise } = this.providerConfig;
		let returnHost;
		if (isEnterprise) {
			returnHost = host;
		} else if (forEnterprise) {
			returnHost = this._providerInfo?.data?.baseUrl || host;
		} else {
			returnHost = `https://${apiHost}`;
		}
		return `${returnHost}${this.apiPath}`;
	}

	get graphQlBaseUrl() {
		return `${this.baseUrl.replace(`/${GitHubEnterpriseProvider.ApiVersionString}`, "")}/graphql`;
	}

	async ensureInitialized() {
		await this.getVersion();
	}

	protected async getVersion(): Promise<ProviderVersion> {
		try {
			if (this._version == null) {
				const response = await this.get<{ installed_version: string }>("/meta");
				const installedVersion = response.body.installed_version;
				this._version = {
					version: installedVersion,
					asArray: (installedVersion || "0.0.0").split(".").map(Number)
				};
				Logger.log(
					`GitHubEnterprise getVersion - ${this.providerConfig.id} version=${this._version.version}`
				);
				Container.instance().errorReporter.reportBreadcrumb({
					message: `GitHubEnterprise getVersion`,
					data: {
						version: this._version
					}
				});
			}
		} catch (ex) {
			Logger.error(ex);
			this._version = this.DEFAULT_VERSION;
		}
		return this._version;
	}

	getIsMatchingRemotePredicate() {
		const baseUrl = this._providerInfo?.data?.baseUrl || this.getConfig().host;
		const configDomain = baseUrl ? URI.parse(baseUrl).authority : "";
		return (r: GitRemoteLike) => configDomain !== "" && r.domain === configDomain;
	}

	private _isPRApiCompatible: boolean | undefined;
	protected async isPRApiCompatible(): Promise<boolean> {
		if (this._isPRApiCompatible == null) {
			const version = await this.getVersion();
			const [major, minor] = version.asArray;
			this._isPRApiCompatible = major > 2 || (major === 2 && minor >= 15);
		}

		return this._isPRApiCompatible;
	}

	private _isPRCreationApiCompatible: boolean | undefined;
	protected async isPRCreationApiCompatible(): Promise<boolean> {
		if (this._isPRCreationApiCompatible == null) {
			try {
				const version = await this.getVersion();
				const [major, minor, patch] = version.asArray;
				this._isPRCreationApiCompatible = major > 2 || (major === 2 && minor >= 19 && patch >= 6);
			} catch (ex) {
				this._isPRCreationApiCompatible = false;
				Logger.warn(ex);
			}
		}

		return this._isPRCreationApiCompatible;
	}

	async getRepoInfo(request: { remote: string }): Promise<ProviderGetRepoInfoResponse> {
		try {
			const { owner, name } = this.getOwnerFromRemote(request.remote);
			const repoResponse = await this.get<GitHubEnterpriseRepo>(`/repos/${owner}/${name}`);
			const pullRequestResponse = await this.get<GitHubEnterprisePullRequest[]>(
				`/repos/${owner}/${name}/pulls?state=open`
			);
			const pullRequests: ProviderPullRequestInfo[] = [];
			if (pullRequestResponse) {
				pullRequestResponse.body.map(_ => {
					return {
						id: _.id,
						url: _.html_url,
						baseRefName: _.base.ref,
						headRefName: _.head.ref
					};
				});
			}
			return {
				id: repoResponse.body.id,
				defaultBranch: repoResponse.body.default_branch,
				pullRequests: pullRequests
			};
		} catch (ex) {
			Logger.error(ex, `${this.displayName}: getRepoInfo`, {
				remote: request.remote
			});
			return {
				error: {
					type: "PROVIDER",
					message: `${this.displayName}: ${ex.message}`
				}
			};
		}
	}

	@log()
	async configure(request: ProviderConfigurationData) {
		await this.session.api.setThirdPartyProviderToken({
			providerId: this.providerConfig.id,
			host: request.host,
			token: request.token,
			data: {
				baseUrl: request.baseUrl
			}
		});
		this.session.updateProviders();
	}

	private _atMe: string | undefined;
	/**
	 * getMe - gets the username (login) for a GH request
	 *
	 * @protected
	 * @return {*}  {Promise<string>}
	 * @memberof GitHubEnterpriseProvider
	 */
	protected async getMe(): Promise<string> {
		if (this._atMe) return this._atMe;

		try {
			const query = await this.query<any>(`
			query {
				viewer {
					login
				}
			}`);

			this._atMe = query.viewer.login;
			return this._atMe!;
		} catch (ex) {
			Logger.error(ex);
		}
		this._atMe = await super.getMe();
		return this._atMe;
	}

	protected async client(): Promise<GraphQLClient> {
		if (this._client === undefined && this.accessToken) {
			// query for the version
			await this.getVersion();
		}
		return super.client();
	}

	async query<T = any>(query: string, variables: any = undefined) {
		const v = await this.getVersion();
		// we know that in version 2.19.6, @me doesn't work
		if (v && semver.lt(v.version, "2.21.0") && query.indexOf("@me") > -1) {
			query = query.replace(/@me/g, await this.getMe());
		}
		return super.query<T>(query, variables);
	}

	async createPullRequestReviewComment(request: {
		pullRequestId: string;
		pullRequestReviewId?: string;
		text: string;
		filePath?: string;
		position?: number;
	}) {
		const v = await this.getVersion();
		if (v && semver.lt(v.version, "2.21.0")) {
			// https://docs.github.com/en/enterprise-server@2.19/graphql/reference/input-objects#addpullrequestreviewcommentinput
			// https://docs.github.com/en/enterprise-server@2.20/graphql/reference/input-objects#addpullrequestreviewcommentinput
			let query;
			if (request.pullRequestReviewId) {
				query = `mutation AddPullRequestReviewComment($text:String!, $pullRequestId:ID!, $pullRequestReviewId:ID!, $filePath:String, $position:Int) {
					addPullRequestReviewComment(input: {body:$text, pullRequestId:$pullRequestId, pullRequestReviewId:$pullRequestReviewId, path:$filePath, position:$position}) {
					  clientMutationId
					}
				  }
				  `;
			} else {
				request.pullRequestReviewId = await this.getPullRequestReviewId(request);
				if (!request.pullRequestReviewId) {
					const result = await this.addPullRequestReview(request);
					if (result?.addPullRequestReview?.pullRequestReview?.id) {
						request.pullRequestReviewId = result.addPullRequestReview.pullRequestReview.id;
					}
				}
				query = `mutation AddPullRequestReviewComment($text:String!, $pullRequestReviewId:ID!, $filePath:String, $position:Int) {
					addPullRequestReviewComment(input: {body:$text, pullRequestReviewId:$pullRequestReviewId, path:$filePath, position:$position}) {
					  clientMutationId
					}
				  }
				  `;
				const response = await this.mutate<any>(query, request);

				this._pullRequestCache.delete(request.pullRequestId);
				this.session.agent.sendNotification(DidChangePullRequestCommentsNotificationType, {
					pullRequestId: request.pullRequestId,
					filePath: request.filePath
				});
				return response;
			}
		} else {
			return super.createPullRequestReviewComment(request);
		}
	}

	async submitReview(request: {
		pullRequestId: string;
		text: string;
		eventType: string;
		// used with old servers
		pullRequestReviewId?: string;
	}) {
		if (!request.eventType) {
			request.eventType = "COMMENT";
		}
		if (
			request.eventType !== "COMMENT" &&
			request.eventType !== "APPROVE" &&
			// for some reason I cannot get DISMISS to work...
			// request.eventType !== "DISMISS" &&
			request.eventType !== "REQUEST_CHANGES"
		) {
			throw new Error("Invalid eventType");
		}

		let response;
		const v = await this.getVersion();
		if (v && semver.lt(v.version, "2.21.0")) {
			// https://docs.github.com/en/enterprise-server@2.19/graphql/reference/input-objects#submitpullrequestreviewinput
			// https://docs.github.com/en/enterprise-server@2.20/graphql/reference/input-objects#submitpullrequestreviewinput
			const existingReview = await this.getPendingReview(request);
			if (!existingReview) {
				const result = await this.addPullRequestReview(request);
				request.pullRequestReviewId = result?.addPullRequestReview?.pullRequestReview?.id;
			} else {
				request.pullRequestReviewId = existingReview.pullRequestReviewId;
			}
			const query = `mutation SubmitPullRequestReview($pullRequestReviewId:ID!, $body:String) {
			submitPullRequestReview(input: {event: ${request.eventType}, body: $body, pullRequestReviewId: $pullRequestReviewId}){
			  clientMutationId
			}
		  }
		  `;
			response = await this.mutate<any>(query, {
				pullRequestReviewId: request.pullRequestReviewId,
				body: request.text
			});
		} else {
			// > 2.21.X works as the latest
			response = super.submitReview(request);
		}

		return response;
	}
}

interface GitHubEnterpriseRepo {
	id: string;
	full_name: string;
	path: string;
	has_issues: boolean;
	default_branch: string;
}

interface GitHubEnterprisePullRequest {
	id: string;
	html_url: string;
	base: { ref: string };
	head: { ref: string };
}
